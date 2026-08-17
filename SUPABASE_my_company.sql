-- Fire-S: return the signed-in user's primary company (SECURITY DEFINER)
-- Picks the active membership with the most team members so staff on a large
-- company are not left on a personal shell company after login.
-- Run in Supabase SQL Editor once (replaces prior fire_s_my_company()).

begin;

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
      from public.company_members as cm
      where cm.company_id = m.company_id
        and coalesce(cm.status, 'active') = 'active'
    ) desc,
    case m.role
      when 'manager' then 0
      when 'inspector' then 1
      when 'company_owner' then 2
      else 3
    end,
    c.name asc
    limit 1;
end;
$$;

grant execute on function public.fire_s_my_company() to authenticated;

-- Also stop fire_s_create_company from returning / creating a shell company
-- when the user already belongs to Company S.
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

grant execute on function public.fire_s_create_company(text) to authenticated;

commit;
