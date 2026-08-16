-- Fire-S: RESET inspections RLS (run this whole script in Supabase SQL Editor)
-- Fixes: Cloud upload failed: new row violates row-level security policy for table "inspections"

begin;

-- 1) Helper: active company membership
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

revoke all on function public.fire_s_is_company_member(uuid) from public;
grant execute on function public.fire_s_is_company_member(uuid) to authenticated;

-- 2) Turn RLS on
alter table public.inspections enable row level security;

-- 3) Drop EVERY existing policy on inspections (old names included)
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'inspections'
  loop
    execute format('drop policy if exists %I on public.inspections', r.policyname);
  end loop;
end $$;

-- 4) Simple policies that always allow YOUR own uploads
create policy "fire_s_inspections_select"
  on public.inspections
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
  );

create policy "fire_s_inspections_insert"
  on public.inspections
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
  );

create policy "fire_s_inspections_update"
  on public.inspections
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
  )
  with check (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
  );

create policy "fire_s_inspections_delete"
  on public.inspections
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
  );

commit;

-- Optional check: should list the 4 fire_s_inspections_* policies
-- select policyname, cmd from pg_policies where tablename = 'inspections';
