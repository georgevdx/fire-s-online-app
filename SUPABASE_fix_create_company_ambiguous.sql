-- Fix: column reference "company_id" is ambiguous
-- Cause: fire_s_create_company RETURNS TABLE(company_id ...) collides with
-- company_members.company_id inside the function body.
-- Run ALL of this in Supabase SQL Editor, then click Save company again.

begin;

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

  -- If user already belongs to a company, return the primary one
  -- (most members, prefer "Company S") instead of LIMIT 1.
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
  values (v_name, 'active', 'development')
  returning c.id into v_company_id;

  insert into public.company_members as cm (company_id, user_id, role, status)
  values (v_company_id, v_uid, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update
     set role = excluded.role,
         status = 'active';

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

-- Keep start-fresh aligned (already used out_* names; refresh for safety)
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

  update public.company_members as cm
     set status = 'inactive'
   where cm.user_id = v_uid
     and coalesce(cm.status, 'active') = 'active';

  insert into public.companies as c (name, status, plan)
  values (v_name, 'active', 'development')
  returning c.id into v_company_id;

  insert into public.company_members as cm (company_id, user_id, role, status)
  values (v_company_id, v_uid, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update
     set role = 'company_owner',
         status = 'active';

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

grant execute on function public.fire_s_start_fresh_company(text) to authenticated;

commit;

select 'fire_s_create_company ambiguous fix ready' as status;
