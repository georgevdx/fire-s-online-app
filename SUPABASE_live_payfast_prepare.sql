-- Fire-S LIVE: remember the company for PayFast without hiding inspections.
-- Run on live (ispsdmglyylcwkufphnv) AFTER the entitlement / PayFast SQL.
-- Do not run SUPABASE_payfast_resubscribe.sql or SUPABASE_payfast_open_company.sql
-- on live — those prefer a cancelled company over Fire-S inspection data.
--
-- This does not delete inspections. Home still prefers the company with the
-- most inspections. Pay on PayFast can pin a company for that login.

begin;

create table if not exists public.fire_s_payfast_checkout_intent (
  user_id uuid primary key,
  company_id uuid not null references public.companies (id),
  company_name text,
  updated_at timestamptz not null default now()
);

revoke all on table public.fire_s_payfast_checkout_intent from public;
revoke all on table public.fire_s_payfast_checkout_intent from anon;
revoke all on table public.fire_s_payfast_checkout_intent from authenticated;

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

  -- Company already chosen for PayFast on this login.
  begin
    select i.company_id, c.name,
      case
        when v_super then 'super_admin'::text
        else coalesce(m.role::text, 'company_owner')
      end
      into v_id, v_name, v_role
    from public.fire_s_payfast_checkout_intent i
    join public.companies c on c.id = i.company_id
    left join public.company_members m
      on m.company_id = i.company_id
     and m.user_id = v_uid
    where i.user_id = v_uid
    limit 1;
  exception when others then
    v_id := null;
  end;
  if v_id is not null then
    return query select v_id, v_name, v_role;
    return;
  end if;

  -- Keep live Home on the company that holds inspections, not a shell.
  return query
    select
      c.id,
      c.name,
      case when v_super then 'super_admin'::text else m.role::text end
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

drop function if exists public.fire_s_prepare_payfast_company(uuid);
drop function if exists public.fire_s_prepare_payfast_company(uuid, text);

create or replace function public.fire_s_prepare_payfast_company(
  p_company_id uuid default null,
  p_company_name text default null
)
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
  v_name text := nullif(trim(p_company_name), '');
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
      v_name := nullif(trim(p_company_name), '');
    end if;
  end if;

  if v_company is null and v_name is not null then
    select c.id, c.name into v_company, v_name
    from public.companies c
    where lower(trim(c.name)) = lower(trim(v_name))
    order by coalesce(c.created_at, now()) desc
    limit 1;
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

    -- Remember the existing company only. Do not insert company_members here:
    -- that trigger thinks we are adding a paid login and blocks PayFast.
    insert into public.fire_s_payfast_checkout_intent (user_id, company_id, company_name, updated_at)
    values (v_uid, v_company, v_name, now())
    on conflict (user_id)
    do update set
      company_id = excluded.company_id,
      company_name = excluded.company_name,
      updated_at = now();

    return query select v_company, v_name, v_role;
    return;
  end if;

  return query
    select mc.out_company_id, mc.out_company_name, mc.out_member_role
    from public.fire_s_my_company() mc;
end;
$$;

grant execute on function public.fire_s_prepare_payfast_company(uuid, text) to authenticated;

comment on function public.fire_s_prepare_payfast_company(uuid, text) is
  'Remember the existing company on this login so PayFast can bill it. Does not create a new company. Does not add a login. Does not delete inspections.';

commit;

notify pgrst, 'reload schema';

select 'fire_s live payfast prepare ready' as status;
