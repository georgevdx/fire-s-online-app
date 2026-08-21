-- Fire-S: store the chosen subscribe package on the company
-- Optional. The app still saves plan by updating companies.plan after create.
-- Run in Supabase SQL Editor once if you want create-company to accept p_plan.

begin;

drop function if exists public.fire_s_create_company(text);
drop function if exists public.fire_s_create_company(text, text);

create or replace function public.fire_s_create_company(p_name text, p_plan text default 'executive')
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
  v_plan text := lower(nullif(trim(p_plan), ''));
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_name is null then
    v_name := 'Fire-S Company';
  end if;

  if v_plan is null or v_plan not in ('standard', 'seat', 'field', 'operations', 'executive', 'enterprise') then
    v_plan := 'standard';
  end if;

  select m.company_id, m.role
    into v_company_id, v_role
  from public.company_members as m
  join public.companies as c on c.id = m.company_id
  where m.user_id = v_uid
    and coalesce(m.status, 'active') = 'active'
  order by (
    select count(*)::int
    from public.company_members as cm
    where cm.company_id = m.company_id
      and coalesce(cm.status, 'active') = 'active'
  ) desc,
  case when lower(trim(c.name)) = lower(trim('Company S')) then 0 else 1 end,
  c.name asc
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
  values (v_name, 'active', v_plan)
  returning c.id into v_company_id;

  insert into public.company_members as cm (company_id, user_id, role, status)
  values (v_company_id, v_uid, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update set role = excluded.role, status = 'active';

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

grant execute on function public.fire_s_create_company(text, text) to authenticated;

create or replace function public.fire_s_set_company_plan(p_plan text)
returns table (
  out_company_id uuid,
  out_plan text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_plan text := lower(nullif(trim(p_plan), ''));
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_plan is null or v_plan not in ('standard', 'seat', 'field', 'operations', 'executive', 'enterprise') then
    v_plan := 'standard';
  end if;

  select m.company_id
    into v_company_id
  from public.company_members as m
  where m.user_id = v_uid
    and coalesce(m.status, 'active') = 'active'
    and m.role in ('company_owner', 'owner', 'super_admin')
  order by case m.role when 'company_owner' then 0 else 1 end
  limit 1;

  if v_company_id is null then
    raise exception 'Only the Owner can change the package';
  end if;

  update public.companies
     set plan = v_plan
   where id = v_company_id;

  return query
    select v_company_id, v_plan;
end;
$$;

grant execute on function public.fire_s_set_company_plan(text) to authenticated;

commit;
