-- Fire-S: inspections RLS for company teams
-- Fixes: "new row violates row-level security policy (USING expression) for table inspections"
--
-- Run once in Supabase SQL Editor (as project owner).
-- Allows:
--   - users to insert/update their own inspections
--   - active company members to read/update inspections for their company

begin;

-- Helper: is the current user an active member of this company?
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

grant execute on function public.fire_s_is_company_member(uuid) to authenticated;

alter table public.inspections enable row level security;

-- Drop older Fire-S / generic policies if present (safe if missing)
drop policy if exists "fire_s_inspections_select" on public.inspections;
drop policy if exists "fire_s_inspections_insert" on public.inspections;
drop policy if exists "fire_s_inspections_update" on public.inspections;
drop policy if exists "fire_s_inspections_delete" on public.inspections;
drop policy if exists "Users can view own inspections" on public.inspections;
drop policy if exists "Users can insert own inspections" on public.inspections;
drop policy if exists "Users can update own inspections" on public.inspections;
drop policy if exists "Users can delete own inspections" on public.inspections;

-- Read: own row OR same company
create policy "fire_s_inspections_select"
  on public.inspections
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      company_id is not null
      and public.fire_s_is_company_member(company_id)
    )
  );

-- Insert: must be your user_id; company optional but must be a company you belong to
create policy "fire_s_inspections_insert"
  on public.inspections
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      company_id is null
      or public.fire_s_is_company_member(company_id)
    )
  );

-- Update: can edit own rows, or company rows if you are a member.
-- New row must stay yours OR stay in a company you belong to.
create policy "fire_s_inspections_update"
  on public.inspections
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or (
      company_id is not null
      and public.fire_s_is_company_member(company_id)
    )
  )
  with check (
    user_id = auth.uid()
    or (
      company_id is not null
      and public.fire_s_is_company_member(company_id)
    )
  );

-- Delete: own rows, or company rows if member
create policy "fire_s_inspections_delete"
  on public.inspections
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or (
      company_id is not null
      and public.fire_s_is_company_member(company_id)
    )
  );

commit;
