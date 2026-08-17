-- Fire-S: List and safely deactivate OLD test companies (keep Company S only)
-- Run in Supabase SQL Editor.
--
-- Team emails (change here if needed):
--   georgevdx@gmail.com, johandb@live.com, johandb1974ik@gmail.com,
--   com1@gmail.com, coi1@gmail.com, 1@gmail.com
--
-- SAFE behaviour:
--   • Does NOT delete auth.users, profiles, companies, or inspections
--   • Sets company_members.status = 'inactive' on non–Company S memberships
--   • Cancels pending company_invites on non–Company S companies
--
-- WORKFLOW:
--   1) Run section A (PREVIEW) only — check the lists
--   2) Run section B (APPLY) inside a transaction when preview looks correct
--   3) Run section C (VERIFY)
--   4) Then SUPABASE_fix_company_roles.sql
--   5) Then SUPABASE_my_company.sql
--   6) Optional: SUPABASE_delete_empty_test_companies.sql (scrap empty shells)
--   7) Everyone logout + login (or clear site data once)

-- =============================================================================
-- A) PREVIEW — read-only (safe to run anytime)
-- =============================================================================

-- Canonical company to KEEP (case-insensitive match on companies.name)
-- Change only if your real company uses another name:
with keep as (
  select c.id, c.name
  from public.companies as c
  where lower(trim(c.name)) = lower(trim('Company S'))
  order by c.created_at nulls last
  limit 1
),
team as (
  select unnest(array[
    'georgevdx@gmail.com',
    'johandb@live.com',
    'johandb1974ik@gmail.com',
    'com1@gmail.com',
    'coi1@gmail.com',
    '1@gmail.com'
  ]::text[]) as email
)
select
  'KEEP company' as section,
  k.id as company_id,
  k.name as company_name
from keep as k
union all
select
  'MISSING — fix name before APPLY' as section,
  null::uuid,
  'Company S not found in public.companies'
where not exists (select 1 from keep);

-- All ACTIVE memberships for team emails (every company)
with team as (
  select unnest(array[
    'georgevdx@gmail.com',
    'johandb@live.com',
    'johandb1974ik@gmail.com',
    'com1@gmail.com',
    'coi1@gmail.com',
    '1@gmail.com'
  ]::text[]) as email
),
keep as (
  select c.id
  from public.companies as c
  where lower(trim(c.name)) = lower(trim('Company S'))
  limit 1
)
select
  c.name as company_name,
  c.id as company_id,
  p.email,
  cm.role,
  cm.status,
  case
    when c.id = (select id from keep) then 'KEEP'
    else 'WILL DEACTIVATE'
  end as cleanup_action
from public.company_members as cm
join public.profiles as p on p.id = cm.user_id
join public.companies as c on c.id = cm.company_id
where lower(trim(p.email)) in (select lower(trim(email)) from team)
  and coalesce(cm.status, 'active') = 'active'
order by cleanup_action desc, c.name, p.email;

-- Other companies (not Company S) that still have ANY active member from the team
with team as (
  select unnest(array[
    'georgevdx@gmail.com',
    'johandb@live.com',
    'johandb1974ik@gmail.com',
    'com1@gmail.com',
    'coi1@gmail.com',
    '1@gmail.com'
  ]::text[]) as email
),
keep as (
  select c.id
  from public.companies as c
  where lower(trim(c.name)) = lower(trim('Company S'))
  limit 1
)
select
  c.id as company_id,
  c.name as company_name,
  count(distinct cm.user_id) as team_active_members,
  string_agg(distinct p.email, ', ' order by p.email) as team_emails
from public.companies as c
join public.company_members as cm on cm.company_id = c.id
join public.profiles as p on p.id = cm.user_id
where coalesce(cm.status, 'active') = 'active'
  and lower(trim(p.email)) in (select lower(trim(email)) from team)
  and c.id <> coalesce((select id from keep), '00000000-0000-0000-0000-000000000000'::uuid)
group by c.id, c.name
order by c.name;

-- Pending invites for team emails on non–Company S companies
with team as (
  select unnest(array[
    'georgevdx@gmail.com',
    'johandb@live.com',
    'johandb1974ik@gmail.com',
    'com1@gmail.com',
    'coi1@gmail.com',
    '1@gmail.com'
  ]::text[]) as email
),
keep as (
  select c.id
  from public.companies as c
  where lower(trim(c.name)) = lower(trim('Company S'))
  limit 1
)
select
  c.name as company_name,
  i.email,
  i.role,
  i.status,
  'WILL CANCEL' as cleanup_action
from public.company_invites as i
join public.companies as c on c.id = i.company_id
where coalesce(i.status, 'pending') = 'pending'
  and lower(trim(i.email)) in (select lower(trim(email)) from team)
  and i.company_id <> coalesce((select id from keep), '00000000-0000-0000-0000-000000000000'::uuid)
order by c.name, i.email;


-- =============================================================================
-- B) APPLY — deactivates test memberships (run after preview looks correct)
-- =============================================================================

begin;

do $$
declare
  v_keep_id uuid;
  v_keep_name text;
  v_deactivated int := 0;
  v_invites int := 0;
begin
  select c.id, c.name
    into v_keep_id, v_keep_name
  from public.companies as c
  where lower(trim(c.name)) = lower(trim('Company S'))
  order by c.created_at nulls last
  limit 1;

  if v_keep_id is null then
    raise exception 'Company S not found. Create/rename your main company first, or change the keep name in this script.';
  end if;

  raise notice 'Keeping company: % (%)', v_keep_name, v_keep_id;

  -- Deactivate active memberships for team emails on every OTHER company
  update public.company_members as cm
     set status = 'inactive'
    from public.profiles as p
   where cm.user_id = p.id
     and cm.company_id <> v_keep_id
     and coalesce(cm.status, 'active') = 'active'
     and lower(trim(p.email)) in (
       'georgevdx@gmail.com',
       'johandb@live.com',
       'johandb1974ik@gmail.com',
       'com1@gmail.com',
       'coi1@gmail.com',
       '1@gmail.com'
     );

  get diagnostics v_deactivated = row_count;
  raise notice 'Deactivated % membership row(s) outside Company S', v_deactivated;

  -- Cancel pending invites on non–Company S companies for team emails
  begin
    update public.company_invites as i
       set status = 'cancelled'
     where i.company_id <> v_keep_id
       and coalesce(i.status, 'pending') = 'pending'
       and lower(trim(i.email)) in (
         'georgevdx@gmail.com',
         'johandb@live.com',
         'johandb1974ik@gmail.com',
         'com1@gmail.com',
         'coi1@gmail.com',
         '1@gmail.com'
       );

    get diagnostics v_invites = row_count;
    raise notice 'Cancelled % pending invite(s) outside Company S', v_invites;
  exception
    when undefined_table then
      raise notice 'company_invites table not found — skipped invite cleanup';
  end;

  -- Ensure team members stay ACTIVE on Company S (reactivate if accidentally inactive)
  update public.company_members as cm
     set status = 'active'
    from public.profiles as p
   where cm.user_id = p.id
     and cm.company_id = v_keep_id
     and lower(trim(p.email)) in (
       'georgevdx@gmail.com',
       'johandb@live.com',
       'johandb1974ik@gmail.com',
       'com1@gmail.com',
       'coi1@gmail.com',
       '1@gmail.com'
     );
end $$;

commit;


-- =============================================================================
-- C) VERIFY — run after APPLY
-- =============================================================================

with keep as (
  select c.id, c.name
  from public.companies as c
  where lower(trim(c.name)) = lower(trim('Company S'))
  limit 1
),
team as (
  select unnest(array[
    'georgevdx@gmail.com',
    'johandb@live.com',
    'johandb1974ik@gmail.com',
    'com1@gmail.com',
    'coi1@gmail.com',
    '1@gmail.com'
  ]::text[]) as email
)
select
  c.name as company_name,
  p.email,
  cm.role,
  cm.status
from public.company_members as cm
join public.profiles as p on p.id = cm.user_id
join public.companies as c on c.id = cm.company_id
where lower(trim(p.email)) in (select lower(trim(email)) from team)
  and coalesce(cm.status, 'active') = 'active'
order by c.name, cm.role, p.email;

-- Expect: ONLY rows for company_name = 'Company S' (6 people after roles are set)

select
  (select count(*) from public.companies) as companies_total,
  (select count(*)
     from public.company_members
    where coalesce(status, 'active') = 'active') as active_memberships_total,
  (select count(*)
     from public.company_invites
    where coalesce(status, 'pending') = 'pending') as pending_invites_total;
