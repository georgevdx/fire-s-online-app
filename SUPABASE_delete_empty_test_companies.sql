-- Fire-S: Scrap EMPTY test companies after deactivate (keep Company S)
-- Run in Supabase SQL Editor AFTER SUPABASE_cleanup_test_companies.sql.
--
-- SAFE behaviour:
--   • Does NOT delete auth.users or profiles
--   • Does NOT delete Company S
--   • Reassigns team inspections from test companies onto Company S
--   • Deletes only companies that then have 0 memberships and 0 inspections
--
-- WORKFLOW:
--   1) Run section A (PREVIEW)
--   2) Run section B (APPLY) when preview looks correct
--   3) Run section C (VERIFY)

-- =============================================================================
-- A) PREVIEW — read-only
-- =============================================================================

with keep as (
  select c.id, c.name
  from public.companies as c
  where lower(trim(c.name)) = lower(trim('Company S'))
  order by c.created_at nulls last
  limit 1
)
select
  c.id as company_id,
  c.name as company_name,
  (
    select count(*) from public.company_members as cm
    where cm.company_id = c.id
      and coalesce(cm.status, 'active') = 'active'
  ) as active_members,
  (
    select count(*) from public.company_members as cm
    where cm.company_id = c.id
  ) as membership_rows,
  (
    select count(*) from public.inspections as i
    where i.company_id = c.id
  ) as inspections,
  case
    when (
      select count(*) from public.company_members as cm
      where cm.company_id = c.id
        and coalesce(cm.status, 'active') = 'active'
    ) = 0
    then 'CANDIDATE'
    else 'SKIP — still has active members'
  end as delete_action
from public.companies as c
where c.id <> coalesce((select id from keep), '00000000-0000-0000-0000-000000000000'::uuid)
order by c.name;


-- =============================================================================
-- B) APPLY — reassign team inspections, then delete empty shells
-- =============================================================================

begin;

do $$
declare
  v_keep_id uuid;
  v_keep_name text;
  v_moved int := 0;
  v_members int := 0;
  v_invites int := 0;
  v_companies int := 0;
begin
  select c.id, c.name
    into v_keep_id, v_keep_name
  from public.companies as c
  where lower(trim(c.name)) = lower(trim('Company S'))
  order by c.created_at nulls last
  limit 1;

  if v_keep_id is null then
    raise exception 'Company S not found. Run cleanup/roles first, or change the keep name.';
  end if;

  raise notice 'Keeping company: % (%)', v_keep_name, v_keep_id;

  -- Move inspections that belong to team users off test companies onto Company S
  begin
    update public.inspections as i
       set company_id = v_keep_id,
           inspection_data = coalesce(i.inspection_data, '{}'::jsonb)
             || jsonb_build_object('companyId', v_keep_id, 'company_id', v_keep_id)
      from public.profiles as p
     where i.user_id = p.id
       and i.company_id is not null
       and i.company_id <> v_keep_id
       and lower(trim(p.email)) in (
         'georgevdx@gmail.com',
         'johandb@live.com',
         'johandb1974ik@gmail.com',
         'com1@gmail.com',
         'coi1@gmail.com',
         '1@gmail.com'
       );
    get diagnostics v_moved = row_count;
    raise notice 'Moved % team inspection(s) onto Company S', v_moved;
  exception
    when undefined_table then
      raise notice 'inspections table not found — skipped inspection move';
    when undefined_column then
      raise notice 'inspections.company_id missing — skipped inspection move';
  end;

  -- Drop leftover (usually inactive) team memberships on non–Company S rows
  delete from public.company_members as cm
   using public.profiles as p
  where cm.user_id = p.id
    and cm.company_id <> v_keep_id
    and lower(trim(p.email)) in (
      'georgevdx@gmail.com',
      'johandb@live.com',
      'johandb1974ik@gmail.com',
      'com1@gmail.com',
      'coi1@gmail.com',
      '1@gmail.com'
    );
  get diagnostics v_members = row_count;
  raise notice 'Removed % team membership row(s) outside Company S', v_members;

  begin
    delete from public.company_invites as i
     where i.company_id <> v_keep_id
       and lower(trim(i.email)) in (
         'georgevdx@gmail.com',
         'johandb@live.com',
         'johandb1974ik@gmail.com',
         'com1@gmail.com',
         'coi1@gmail.com',
         '1@gmail.com'
       );
    get diagnostics v_invites = row_count;
    raise notice 'Removed % team invite(s) outside Company S', v_invites;
  exception
    when undefined_table then
      raise notice 'company_invites table not found — skipped invite delete';
  end;

  -- Delete companies that now have zero memberships and zero inspections
  begin
    delete from public.companies as c
     where c.id <> v_keep_id
       and not exists (
         select 1 from public.company_members as cm where cm.company_id = c.id
       )
       and not exists (
         select 1 from public.inspections as i where i.company_id = c.id
       );
    get diagnostics v_companies = row_count;
    raise notice 'Deleted % empty test company row(s)', v_companies;
  exception
    when undefined_table then
      delete from public.companies as c
       where c.id <> v_keep_id
         and not exists (
           select 1 from public.company_members as cm where cm.company_id = c.id
         );
      get diagnostics v_companies = row_count;
      raise notice 'Deleted % empty test company row(s) (no inspections table)', v_companies;
  end;
end $$;

commit;


-- =============================================================================
-- C) VERIFY
-- =============================================================================

select c.id, c.name,
  (select count(*) from public.company_members cm where cm.company_id = c.id) as members,
  (select count(*) from public.inspections i where i.company_id = c.id) as inspections
from public.companies c
order by c.name;
