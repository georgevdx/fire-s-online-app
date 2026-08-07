-- Fire-S: Create company via SECURITY DEFINER RPC
-- Fixes: "new row violates row-level security policy for table companies"
-- Run ALL of this in Supabase SQL Editor, then click Create company again.

begin;

-- 1) Helper: create company + link current user as owner (bypasses RLS)
-- NOTE: output columns use out_* names to avoid ambiguous "company_id"
-- collisions with company_members.company_id inside the function body.
drop function if exists public.fire_s_create_company(text);

create or replace function public.fire_s_create_company(p_name text)
returns table (
  out_company_id uuid,
  out_company_name text,
  out_member_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_name text := nullif(trim(p_name), '');
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_name is null then
    v_name := 'Fire-S Company';
  end if;

  -- If user already belongs to a company, return that instead of creating another.
  select m.company_id, m.role
    into v_company_id, v_role
  from public.company_members as m
  where m.user_id = v_uid
    and coalesce(m.status, 'active') = 'active'
  limit 1;

  if v_company_id is not null then
    return query
      select c.id, c.name, coalesce(v_role, 'company_owner')::text
      from public.companies as c
      where c.id = v_company_id
      limit 1;
    return;
  end if;

  insert into public.companies as c (name, status, plan)
  values (v_name, 'active', 'development')
  returning c.id into v_company_id;

  insert into public.company_members as cm (company_id, user_id, role, status)
  values (v_company_id, v_uid, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update set role = excluded.role, status = 'active';

  -- Best-effort profile role sync
  begin
    update public.profiles as p
       set role = 'company_owner'
     where p.id = v_uid;
  exception when others then
    null;
  end;

  return query
    select c.id, c.name, 'company_owner'::text
    from public.companies as c
    where c.id = v_company_id;
end;
$$;

grant execute on function public.fire_s_create_company(text) to authenticated;

-- 1b) Start a brand-new company (for first-day testing / switching)
-- Deactivates current memberships, then creates a fresh company as owner.
drop function if exists public.fire_s_start_fresh_company(text);

create or replace function public.fire_s_start_fresh_company(p_name text)
returns table (
  out_company_id uuid,
  out_company_name text,
  out_member_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_name text := nullif(trim(p_name), '');
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_name is null then
    v_name := 'New Fire-S Company';
  end if;

  update public.company_members
     set status = 'inactive'
   where user_id = v_uid
     and coalesce(status, 'active') = 'active';

  insert into public.companies (name, status, plan)
  values (v_name, 'active', 'development')
  returning id into v_company_id;

  insert into public.company_members as cm (company_id, user_id, role, status)
  values (v_company_id, v_uid, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update set role = 'company_owner', status = 'active';

  begin
    update public.profiles
       set role = 'company_owner'
     where id = v_uid;
  exception when others then
    null;
  end;

  return query
    select c.id, c.name, 'company_owner'::text
    from public.companies c
    where c.id = v_company_id;
end;
$$;

grant execute on function public.fire_s_start_fresh_company(text) to authenticated;

-- 2) Unique membership key (needed by ON CONFLICT)
create unique index if not exists company_members_company_user_uidx
  on public.company_members (company_id, user_id);

-- 3) Keep simple read policies using definer helpers (no recursion)
create or replace function public.fire_s_is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
  );
$$;

create or replace function public.fire_s_can_manage_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role in ('company_owner', 'manager', 'super_admin')
      and coalesce(m.status, 'active') = 'active'
  );
$$;

grant execute on function public.fire_s_is_company_member(uuid) to authenticated;
grant execute on function public.fire_s_can_manage_company(uuid) to authenticated;

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.profiles enable row level security;

-- Drop previous Fire-S policies (ignore missing)
drop policy if exists "fire_s_companies_select" on public.companies;
drop policy if exists "fire_s_companies_insert" on public.companies;
drop policy if exists "fire_s_companies_update" on public.companies;
drop policy if exists "fire_s_company_members_select" on public.company_members;
drop policy if exists "fire_s_company_members_insert" on public.company_members;
drop policy if exists "fire_s_company_members_update" on public.company_members;
drop policy if exists "fire_s_profiles_select" on public.profiles;
drop policy if exists "fire_s_profiles_update_own" on public.profiles;

create policy "fire_s_companies_select"
  on public.companies for select to authenticated
  using (public.fire_s_is_company_member(id));

-- Keep a direct insert policy as backup (RPC is the main path)
create policy "fire_s_companies_insert"
  on public.companies for insert to authenticated
  with check (true);

create policy "fire_s_companies_update"
  on public.companies for update to authenticated
  using (public.fire_s_can_manage_company(id))
  with check (true);

create policy "fire_s_company_members_select"
  on public.company_members for select to authenticated
  using (user_id = auth.uid() or public.fire_s_is_company_member(company_id));

create policy "fire_s_company_members_insert"
  on public.company_members for insert to authenticated
  with check (user_id = auth.uid() or public.fire_s_can_manage_company(company_id));

create policy "fire_s_company_members_update"
  on public.company_members for update to authenticated
  using (public.fire_s_can_manage_company(company_id))
  with check (true);

create policy "fire_s_profiles_select"
  on public.profiles for select to authenticated
  using (true);

create policy "fire_s_profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

commit;

-- Verify function exists
select proname
from pg_proc
where proname = 'fire_s_create_company';
