-- Fire-S: attach orphan inspections to the inspector's company
-- Paste ALL into Supabase → SQL Editor → Run
--
-- Problem: inspector uploads sometimes landed with inspections.company_id = NULL.
-- Owners/managers only see rows where company_id matches their company.
--
-- This script:
-- 1) Improves fire_s_upsert_inspection to always prefer the user's membership
--    company (and JSON companyId) when the column is missing
-- 2) Backfills existing NULL company_id rows from company_members / JSON

begin;

create or replace function public.fire_s_upsert_inspection(
  p_id text,
  p_inspection_data jsonb,
  p_company_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := null;
  v_company uuid := null;
  v_company_text text := nullif(trim(coalesce(p_company_id, '')), '');
  v_json_company text := null;
  v_owner uuid := null;
  v_existing_company uuid := null;
  v_id_text text := nullif(trim(coalesce(p_id, '')), '');
  v_saved_company uuid := null;
begin
  perform set_config('row_security', 'off', true);

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_id_text is null then
    raise exception 'Inspection id required';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  perform public.fire_s_ensure_profile(v_uid, coalesce(v_email, v_uid::text), 'inspector');

  v_json_company := nullif(
    trim(coalesce(
      p_inspection_data->>'companyId',
      p_inspection_data->>'company_id',
      ''
    )),
    ''
  );

  if v_company_text is null then
    v_company_text := v_json_company;
  end if;

  if v_company_text is not null then
    begin
      if public.fire_s_is_company_member(v_company_text::uuid) then
        v_company := v_company_text::uuid;
      end if;
    exception when others then
      v_company := null;
    end;
  end if;

  if v_company is null then
    select m.company_id into v_company
    from public.company_members m
    where m.user_id = v_uid
      and coalesce(m.status, 'active') = 'active'
    order by m.created_at nulls last
    limit 1;
  end if;

  begin
    select i.user_id, i.company_id
      into v_owner, v_existing_company
    from public.inspections i
    where i.id::text = v_id_text
    limit 1;
  exception when others then
    v_owner := null;
    v_existing_company := null;
  end;

  if v_owner is not null then
    if v_owner <> v_uid
       and not public.fire_s_is_company_member(v_existing_company) then
      raise exception 'Not allowed to update this inspection';
    end if;

    -- Prefer a real company: fill NULL, otherwise keep existing unless caller
    -- supplies a membership company and existing was null.
    v_saved_company := coalesce(v_existing_company, v_company);

    update public.inspections
       set inspection_data = coalesce(p_inspection_data, '{}'::jsonb)
             || jsonb_build_object(
                  'companyId', v_saved_company,
                  'company_id', v_saved_company
                ),
           updated_at = now(),
           company_id = v_saved_company
     where id::text = v_id_text;
  else
    v_saved_company := v_company;
    begin
      insert into public.inspections (id, user_id, company_id, inspection_data, updated_at)
      values (
        v_id_text::uuid,
        v_uid,
        v_saved_company,
        coalesce(p_inspection_data, '{}'::jsonb)
          || case
               when v_saved_company is null then '{}'::jsonb
               else jsonb_build_object(
                 'companyId', v_saved_company,
                 'company_id', v_saved_company
               )
             end,
        now()
      );
    exception when invalid_text_representation then
      insert into public.inspections (id, user_id, company_id, inspection_data, updated_at)
      values (
        v_id_text,
        v_uid,
        v_saved_company,
        coalesce(p_inspection_data, '{}'::jsonb)
          || case
               when v_saved_company is null then '{}'::jsonb
               else jsonb_build_object(
                 'companyId', v_saved_company,
                 'company_id', v_saved_company
               )
             end,
        now()
      );
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_id_text,
    'company_id', v_saved_company
  );
end;
$$;

revoke all on function public.fire_s_upsert_inspection(text, jsonb, text) from public;
grant execute on function public.fire_s_upsert_inspection(text, jsonb, text) to authenticated;

-- Backfill: set company_id from the creator's active membership
update public.inspections i
   set company_id = m.company_id,
       inspection_data = coalesce(i.inspection_data, '{}'::jsonb)
         || jsonb_build_object(
              'companyId', m.company_id,
              'company_id', m.company_id
            ),
       updated_at = now()
  from public.company_members m
 where i.company_id is null
   and m.user_id = i.user_id
   and coalesce(m.status, 'active') = 'active';

-- Backfill from JSON when membership path did not apply
update public.inspections i
   set company_id = nullif(trim(coalesce(
         i.inspection_data->>'companyId',
         i.inspection_data->>'company_id',
         ''
       )), '')::uuid,
       updated_at = now()
 where i.company_id is null
   and nullif(trim(coalesce(
         i.inspection_data->>'companyId',
         i.inspection_data->>'company_id',
         ''
       )), '') is not null;

commit;

select
  count(*) filter (where company_id is null) as still_null_company,
  count(*) filter (where company_id is not null) as with_company
from public.inspections;
