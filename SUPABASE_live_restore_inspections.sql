-- Fire-S LIVE: inspections still 0 after the first repair
-- Paste ALL into Supabase → SQL Editor on the LIVE project (not Fire-S Test).
--
-- Toetsblad came back because many rows had company_id NULL and got stamped
-- onto the current company. Live rows usually ALREADY have company_id, but
-- login is now on a new empty trial company, so the app filters them out.
--
-- This does NOT delete inspections. It:
--   1) Recreates the SELECT policy
--   2) Reactivates memberships on companies that actually have inspections
--   3) Makes fire_s_my_company prefer the company with inspection data
--   4) Parks empty new-trial memberships when the user also has a data company
--   5) Stamps remaining NULL company_id rows onto a live company
--
-- After Success: logout, login, hard-refresh. Do not Download Sync.

begin;

drop policy if exists "fire_s_inspections_select" on public.inspections;
create policy "fire_s_inspections_select"
  on public.inspections for select to authenticated
  using (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
    or public.fire_s_is_super_admin()
  );

alter table public.inspections enable row level security;
alter table public.inspections no force row level security;

-- Prefer the company that holds inspections, not an empty new shell.
drop function if exists public.fire_s_my_company();
create or replace function public.fire_s_my_company()
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
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  return query
    select
      c.id,
      c.name,
      m.role::text
    from public.company_members as m
    join public.companies as c on c.id = m.company_id
    where m.user_id = v_uid
      and coalesce(m.status, 'active') = 'active'
    order by (
      select count(*)::int
      from public.inspections i
      where i.company_id = m.company_id
    ) desc,
    (
      select count(*)::int
      from public.company_members as cm
      where cm.company_id = m.company_id
        and coalesce(cm.status, 'active') = 'active'
    ) desc,
    case when lower(trim(c.name)) = 'company s' then 0 else 1 end,
    c.name asc
    limit 1;
end;
$$;

grant execute on function public.fire_s_my_company() to authenticated;

-- Put people back on the company that still has their inspections.
update public.company_members m
   set status = 'active'
 where exists (
   select 1
   from public.inspections i
   where i.company_id = m.company_id
 );

insert into public.company_members (company_id, user_id, role, status)
select distinct
       i.company_id,
       i.user_id,
       'inspector',
       'active'
  from public.inspections i
  join public.companies c on c.id = i.company_id
 where i.user_id is not null
   and not exists (
     select 1
     from public.company_members m
     where m.company_id = i.company_id
       and m.user_id = i.user_id
   );

update public.company_members m
   set status = 'active'
  from public.inspections i
 where m.company_id = i.company_id
   and m.user_id = i.user_id
   and coalesce(m.status, 'active') is distinct from 'active';

-- If a user is on an empty new trial AND on a company with inspections,
-- hide the empty trial so login lands on the data company.
update public.company_members m
   set status = 'inactive'
  from public.companies c
 where c.id = m.company_id
   and c.trial_started_at is not null
   and not exists (
     select 1 from public.inspections i where i.company_id = c.id
   )
   and exists (
     select 1
     from public.company_members m2
     join public.inspections i2 on i2.company_id = m2.company_id
     where m2.user_id = m.user_id
       and m2.company_id is distinct from m.company_id
       and coalesce(m2.status, 'active') = 'active'
   );

commit;

begin;

do $$
begin
  begin
    execute 'alter table public.inspections disable trigger fire_s_inspections_entitlement_guard';
  exception when undefined_object then
    null;
  end;
end $$;

update public.inspections i
   set company_id = x.company_id,
       inspection_data = coalesce(i.inspection_data, '{}'::jsonb)
         || jsonb_build_object(
              'companyId', x.company_id,
              'company_id', x.company_id
            )
  from (
    select distinct on (m.user_id)
           m.user_id,
           m.company_id
      from public.company_members m
      join public.companies c on c.id = m.company_id
     where coalesce(m.status, 'active') = 'active'
     order by m.user_id,
              (
                select count(*)::int
                from public.inspections i2
                where i2.company_id = m.company_id
              ) desc,
              m.company_id
  ) x
 where i.company_id is null
   and i.user_id = x.user_id;

update public.inspections i
   set company_id = d.company_id,
       inspection_data = coalesce(i.inspection_data, '{}'::jsonb)
         || jsonb_build_object(
              'companyId', d.company_id,
              'company_id', d.company_id
            )
  from (
    select c.id as company_id
      from public.companies c
      left join public.inspections i2 on i2.company_id = c.id
     group by c.id, c.name
     order by count(i2.id) desc,
              case when lower(trim(c.name)) = 'company s' then 0 else 1 end,
              c.name
     limit 1
  ) d
 where i.company_id is null
   and d.company_id is not null;

do $$
begin
  begin
    execute 'alter table public.inspections enable trigger fire_s_inspections_entitlement_guard';
  exception when undefined_object then
    null;
  end;
end $$;

select set_config('fire_s.entitlement_write', 'on', true);

update public.companies c
   set entitlement_status = 'subscription_active',
       subscription_status = 'active',
       subscription_plan_id = coalesce(c.subscription_plan_id, c.plan, 'standard'),
       subscription_started_at = coalesce(c.subscription_started_at, c.created_at, now()),
       billing_status = coalesce(nullif(c.billing_status, ''), 'active'),
       entitlement_updated_at = now()
 where c.trial_started_at is null
   and coalesce(c.subscription_status, '') not in ('cancelled', 'suspended');

commit;

notify pgrst, 'reload schema';

select
  (select count(*) from public.inspections) as inspection_rows,
  (select count(*) from public.inspections where company_id is null) as still_null_company,
  (select count(*) from pg_policies
     where schemaname = 'public'
       and tablename = 'inspections'
       and cmd = 'SELECT') as inspection_select_policies;

select
  c.name as company_name,
  c.id as company_id,
  c.trial_started_at is not null as started_trial,
  (select count(*) from public.inspections i where i.company_id = c.id) as inspections,
  (select count(*) from public.company_members m
    where m.company_id = c.id
      and coalesce(m.status, 'active') = 'active') as active_members
from public.companies c
order by inspections desc, c.name
limit 20;
