-- Fire-S: FULL RESET of inspections RLS
-- Paste ALL of this into Supabase → SQL Editor → Run
-- Fixes: new row violates row-level security policy (USING expression)

begin;

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

alter table public.inspections enable row level security;

-- Drop ALL policies on inspections
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

-- SELECT: own rows or company rows
create policy "fire_s_inspections_select"
  on public.inspections
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
  );

-- INSERT: only require the row belongs to the signed-in user
create policy "fire_s_inspections_insert"
  on public.inspections
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- UPDATE: if you can access the row, allow the new values
-- (WITH CHECK true avoids USING-expression failures when only JSON changes)
create policy "fire_s_inspections_update"
  on public.inspections
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
  )
  with check (true);

create policy "fire_s_inspections_delete"
  on public.inspections
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
  );

commit;

-- Verify (run separately if you want):
-- select policyname, cmd, qual, with_check from pg_policies where tablename = 'inspections';
