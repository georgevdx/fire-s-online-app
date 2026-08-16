-- Fire-S: REPAIR after manual profile deletes + fix inspection uploads
-- Paste ALL into Supabase → SQL Editor → Run

begin;

-- 1) Ensure profile helper exists
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

-- 2) Recreate missing profiles for every Auth user
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  lower(coalesce(u.email, u.id::text)),
  split_part(lower(coalesce(u.email, 'user')), '@', 1),
  'inspector'
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- 3) Membership helper
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
      select 1
      from public.company_members m
      where m.company_id = p_company_id
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') = 'active'
    );
$$;

grant execute on function public.fire_s_is_company_member(uuid) to authenticated;

-- 4) Reset inspections policies
alter table public.inspections enable row level security;

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

-- 5) Upload RPC (bypasses RLS) + recreates profile first
drop function if exists public.fire_s_upsert_inspection(uuid, jsonb, uuid);

create or replace function public.fire_s_upsert_inspection(
  p_id uuid,
  p_inspection_data jsonb,
  p_company_id uuid default null
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
  v_owner uuid := null;
  v_existing_company uuid := null;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_id is null then
    raise exception 'Inspection id required';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  perform public.fire_s_ensure_profile(v_uid, coalesce(v_email, v_uid::text), 'inspector');

  if p_company_id is not null and public.fire_s_is_company_member(p_company_id) then
    v_company := p_company_id;
  else
    select m.company_id into v_company
    from public.company_members m
    where m.user_id = v_uid and coalesce(m.status, 'active') = 'active'
    limit 1;
  end if;

  select i.user_id, i.company_id
    into v_owner, v_existing_company
  from public.inspections i
  where i.id = p_id;

  if v_owner is not null then
    if v_owner <> v_uid and not public.fire_s_is_company_member(v_existing_company) then
      raise exception 'Not allowed to update this inspection';
    end if;

    update public.inspections
       set inspection_data = coalesce(p_inspection_data, '{}'::jsonb),
           updated_at = now(),
           company_id = coalesce(v_existing_company, v_company)
     where id = p_id;
  else
    insert into public.inspections (id, user_id, company_id, inspection_data, updated_at)
    values (p_id, v_uid, v_company, coalesce(p_inspection_data, '{}'::jsonb), now());
  end if;

  return jsonb_build_object('ok', true, 'id', p_id, 'company_id', coalesce(v_existing_company, v_company));
end;
$$;

grant execute on function public.fire_s_upsert_inspection(uuid, jsonb, uuid) to authenticated;

commit;

-- Checks (optional, run after):
-- select count(*) as profiles from public.profiles;
-- select count(*) as members from public.company_members where coalesce(status,'active')='active';
-- select proname from pg_proc where proname = 'fire_s_upsert_inspection';
