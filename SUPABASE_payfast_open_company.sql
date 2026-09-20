-- Fire-S: open PayFast for the company already on this login.
-- Run on Fire-S Test (SQL Editor) AFTER SUPABASE_payfast_resubscribe.sql.
-- Do not run on live.
-- The deployed payfast-checkout function calls fire_s_my_company().
-- This attaches Super Admin / the owner to that cancelled company so checkout
-- finds it, then PayFast can open. Inspections stay. Nothing is deleted.

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
  v_super boolean := false;
  v_id uuid;
  v_name text;
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = v_uid
      and lower(coalesce(p.role, '')) = 'super_admin'
  ) into v_super;

  -- Owner + cancelled/expired first so Subscribe/Reactivate bills the company
  -- already on this login, not a larger staff company or a shell.
  select
    c.id,
    c.name,
    case
      when v_super then 'super_admin'::text
      else m.role::text
    end
    into v_id, v_name, v_role
  from public.company_members as m
  join public.companies as c on c.id = m.company_id
  left join public.fire_s_company_subscriptions as s on s.company_id = c.id
  where m.user_id = v_uid
    and coalesce(m.status, 'active') = 'active'
  order by
    case
      when lower(coalesce(s.status, '')) in ('cancelled', 'expired', 'past_due', 'unpaid')
       and lower(coalesce(m.role, '')) in ('company_owner', 'owner', 'super_admin')
      then 0
      else 1
    end,
    case lower(coalesce(m.role, ''))
      when 'company_owner' then 0
      when 'owner' then 1
      when 'super_admin' then 2
      when 'manager' then 3
      else 4
    end,
    (
      select count(*)::int
      from public.company_members as cm
      where cm.company_id = m.company_id
        and coalesce(cm.status, 'active') = 'active'
    ) desc,
    c.name asc
  limit 1;

  if v_id is null then
    select
      c.id,
      c.name,
      case
        when v_super then 'super_admin'::text
        else m.role::text
      end
      into v_id, v_name, v_role
    from public.company_members as m
    join public.companies as c on c.id = m.company_id
    where m.user_id = v_uid
    order by
      case lower(coalesce(m.role, ''))
        when 'company_owner' then 0
        when 'owner' then 1
        when 'super_admin' then 2
        else 3
      end,
      c.updated_at desc nulls last
    limit 1;
  end if;

  if v_id is null then
    select c.id, c.name, case when v_super then 'super_admin'::text else 'company_owner'::text end
      into v_id, v_name, v_role
    from public.inspections i
    join public.companies c on c.id = i.company_id
    where i.user_id = v_uid
      and i.company_id is not null
    order by i.updated_at desc nulls last
    limit 1;
  end if;

  if v_id is null and v_super then
    select c.id, c.name, 'super_admin'::text
      into v_id, v_name, v_role
    from public.companies c
    left join public.fire_s_company_subscriptions s on s.company_id = c.id
    where lower(coalesce(s.status, ''))
      in ('cancelled', 'expired', 'past_due', 'unpaid')
    order by coalesce(c.updated_at, c.created_at) desc nulls last
    limit 1;
  end if;

  if v_id is null then
    return;
  end if;

  return query select v_id, v_name, v_role;
end;
$$;

grant execute on function public.fire_s_my_company() to authenticated;

create or replace function public.fire_s_prepare_payfast_company(p_company_id uuid default null)
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
  v_super boolean := false;
  v_company uuid := p_company_id;
  v_name text;
  v_role text;
  v_member text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = v_uid
      and lower(coalesce(p.role, '')) = 'super_admin'
  ) into v_super;

  if v_company is not null then
    select c.name into v_name
    from public.companies c
    where c.id = v_company;
    if v_name is null then
      v_company := null;
    end if;
  end if;

  if v_company is not null then
    select m.role::text into v_member
    from public.company_members m
    where m.user_id = v_uid
      and m.company_id = v_company
    order by case lower(coalesce(m.role, ''))
      when 'company_owner' then 0
      when 'owner' then 1
      when 'super_admin' then 2
      else 3
    end
    limit 1;

    if v_member is null and not v_super then
      if exists (
        select 1
        from public.inspections i
        where i.user_id = v_uid
          and i.company_id = v_company
      ) then
        v_member := 'company_owner';
      end if;
    end if;

    if v_member is null and not v_super then
      raise exception 'Not a member of this company';
    end if;

    v_role := case when v_super then 'super_admin' else coalesce(v_member, 'company_owner') end;

    insert into public.company_members (company_id, user_id, role, status)
    values (v_company, v_uid, case when v_super then 'super_admin' else coalesce(v_member, 'company_owner') end, 'active')
    on conflict (company_id, user_id)
    do update set
      status = 'active',
      role = case
        when lower(coalesce(company_members.role, '')) in ('company_owner', 'owner', 'super_admin')
        then company_members.role
        else excluded.role
      end;

    return query select v_company, v_name, v_role;
    return;
  end if;

  return query
    select mc.out_company_id, mc.out_company_name, mc.out_member_role
    from public.fire_s_my_company() mc;
end;
$$;

grant execute on function public.fire_s_prepare_payfast_company(uuid) to authenticated;

comment on function public.fire_s_prepare_payfast_company(uuid) is
  'Attach this login to the company it already pays for, then PayFast can open. Does not delete inspections.';

commit;

notify pgrst, 'reload schema';

select 'fire_s payfast open company ready' as status;
