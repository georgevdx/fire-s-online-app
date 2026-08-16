-- Fire-S BREAK-GLASS fix for inspections upload RLS
-- Paste ALL into Supabase → SQL Editor → Run (must say Success)
--
-- Why uploads still fail even with a security definer RPC:
-- If the table has FORCE ROW LEVEL SECURITY, policies still apply inside
-- security definer functions. We turn that off and disable row_security
-- inside the save function.

begin;

-- 0) Recreate missing profiles (after manual deletes)
create or replace function public.fire_s_ensure_profile(
  p_user_id uuid,
  p_email text,
  p_role text default 'inspector'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    p_user_id,
    lower(trim(p_email)),
    split_part(lower(trim(p_email)), '@', 1),
    coalesce(nullif(trim(p_role), ''), 'inspector')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name);
exception when others then
  null;
end;
$$;

grant execute on function public.fire_s_ensure_profile(uuid, text, text) to authenticated;

insert into public.profiles (id, email, full_name, role)
select
  u.id,
  lower(coalesce(u.email, u.id::text)),
  split_part(lower(coalesce(u.email, 'user')), '@', 1),
  'inspector'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- 1) CRITICAL: stop FORCE RLS from trapping security definer writes
alter table public.inspections enable row level security;
alter table public.inspections no force row level security;

-- 2) Drop every policy
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'inspections'
  loop
    execute format('drop policy if exists %I on public.inspections', r.policyname);
  end loop;
end $$;

create or replace function public.fire_s_is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_company_id is not null
    and exists (
      select 1 from public.company_members m
      where m.company_id = p_company_id
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') = 'active'
    );
$$;

grant execute on function public.fire_s_is_company_member(uuid) to authenticated;

create policy "fire_s_inspections_select"
  on public.inspections for select to authenticated
  using (user_id = auth.uid() or public.fire_s_is_company_member(company_id));

create policy "fire_s_inspections_insert"
  on public.inspections for insert to authenticated
  with check (user_id = auth.uid());

create policy "fire_s_inspections_update"
  on public.inspections for update to authenticated
  using (user_id = auth.uid() or public.fire_s_is_company_member(company_id))
  with check (true);

create policy "fire_s_inspections_delete"
  on public.inspections for delete to authenticated
  using (user_id = auth.uid() or public.fire_s_is_company_member(company_id));

-- 3) Save RPC: accepts TEXT id (handles uuid + legacy ids), disables row_security
drop function if exists public.fire_s_upsert_inspection(uuid, jsonb, uuid);
drop function if exists public.fire_s_upsert_inspection(text, jsonb, uuid);
drop function if exists public.fire_s_upsert_inspection(text, jsonb, text);

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
  -- Bypass RLS inside this function (needed when FORCE RLS was/is involved)
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
    limit 1;
  end if;

  -- Existing row lookup (id may be uuid or text depending on schema)
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

    v_saved_company := coalesce(v_existing_company, v_company);

    update public.inspections
       set inspection_data = coalesce(p_inspection_data, '{}'::jsonb)
             || case
                  when v_saved_company is null then '{}'::jsonb
                  else jsonb_build_object(
                    'companyId', v_saved_company,
                    'company_id', v_saved_company
                  )
                end,
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
      -- id column may be text
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

commit;

-- Verify:
-- select relrowsecurity, relforcerowsecurity from pg_class where relname = 'inspections';
-- select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname = 'fire_s_upsert_inspection';
