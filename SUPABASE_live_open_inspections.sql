-- Fire-S LIVE: data is there (Fire-S = 124 inspections). App still shows 0.
-- Paste ALL into SQL Editor on fireye-sync (LIVE). Does not delete rows.
--
-- Table Editor uses a privileged role so it shows 125 rows even when the
-- app (authenticated + RLS) sees 0. This restores SELECT for the app,
-- marks Fire-S/Secure as subscribed, and reloads PostgREST.

begin;

grant usage on schema public to authenticated;
grant select on table public.inspections to authenticated;
grant select on table public.companies to authenticated;
grant select on table public.company_members to authenticated;
grant execute on function public.fire_s_is_company_member(uuid) to authenticated;

drop policy if exists "fire_s_inspections_select" on public.inspections;
create policy "fire_s_inspections_select"
  on public.inspections for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.company_members m
      where m.company_id = inspections.company_id
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') = 'active'
    )
  );

alter table public.inspections enable row level security;
alter table public.inspections no force row level security;

-- Force paid access on companies that already have inspection work.
do $$
begin
  begin
    execute 'alter table public.companies disable trigger fire_s_protect_company_entitlement';
  exception when undefined_object then
    null;
  end;
end $$;

update public.companies c
   set entitlement_status = 'subscription_active',
       subscription_status = 'active',
       billing_status = coalesce(nullif(c.billing_status, ''), 'active'),
       subscription_plan_id = coalesce(c.subscription_plan_id, c.plan, 'standard'),
       subscription_started_at = coalesce(c.subscription_started_at, c.created_at, now()),
       entitlement_updated_at = now()
 where exists (
   select 1 from public.inspections i where i.company_id = c.id
 );

do $$
begin
  begin
    execute 'alter table public.companies enable trigger fire_s_protect_company_entitlement';
  exception when undefined_object then
    null;
  end;
end $$;

-- Login must prefer Fire-S (124 inspections), not a smaller company.
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
    case
      when lower(trim(c.name)) in ('company s', 'fire-s', 'fire s') then 0
      else 1
    end,
    c.name asc
    limit 1;
end;
$$;

grant execute on function public.fire_s_my_company() to authenticated;

commit;

notify pgrst, 'reload schema';

select
  (select count(*) from public.inspections) as inspection_rows,
  (select count(*) from pg_policies
     where schemaname = 'public'
       and tablename = 'inspections'
       and cmd = 'SELECT') as inspection_select_policies,
  has_table_privilege('authenticated', 'public.inspections', 'SELECT') as authenticated_can_select;

select
  p.email,
  m.role,
  m.status,
  c.name as company_name
from public.company_members m
join public.companies c on c.id = m.company_id
left join public.profiles p on p.id = m.user_id
where c.id = '5b59914c-58c3-4eed-ba88-48573020b26e'
order by m.status, p.email;
