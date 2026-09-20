-- Fire-S: cancelled companies can subscribe again on PayFast.
-- Run on Fire-S Test (SQL Editor). Do not run on live.
-- The already-deployed payfast-checkout Edge Function calls fire_s_my_company().
-- This replace makes that lookup prefer the owned cancelled company, and
-- lets Super Admin pay. Billing no longer throws when the company is cancelled.
-- Inspections stay. Nothing is deleted.

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

  -- Company already chosen for PayFast on this login. Reactivate it; do not create a new one.
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

create or replace function public.fire_s_get_company_billing(p_company_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := p_company_id;
  v_sub public.fire_s_company_subscriptions%rowtype;
  v_info jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_company is null then
    begin
      select mc.out_company_id into v_company
      from public.fire_s_my_company() mc
      limit 1;
    exception when others then
      v_company := null;
    end;
  end if;

  if v_company is null then
    select m.company_id into v_company
    from public.company_members m
    where m.user_id = v_uid
      and coalesce(m.status, 'active') = 'active'
    order by case lower(coalesce(m.role, ''))
      when 'company_owner' then 0
      when 'owner' then 1
      when 'super_admin' then 2
      else 3
    end
    limit 1;
  end if;

  if v_company is null then
    return jsonb_build_object(
      'company_id', null,
      'plan', 'standard',
      'billing_interval', null,
      'subscription_status', 'none',
      'status', 'subscription_required',
      'can_subscribe', true,
      'can_cancel', false,
      'keep_data', true,
      'authority', 'server'
    );
  end if;

  if not public.fire_s_is_super_admin()
     and not public.fire_s_is_company_member(v_company) then
    raise exception 'Not allowed to read another company billing';
  end if;

  select s.* into v_sub
    from public.fire_s_company_subscriptions s
   where s.company_id = v_company;

  begin
    v_info := public.fire_s_compute_entitlement(v_company);
  exception when others then
    v_info := '{}'::jsonb;
  end;

  return jsonb_build_object(
    'company_id', v_company,
    'plan', coalesce(v_info->>'plan', v_sub.plan_code, 'standard'),
    'billing_interval', coalesce(v_info->>'billing_interval', v_sub.billing_interval),
    'subscription_status', coalesce(v_sub.status, v_info->>'subscription_status'),
    'status', v_info->>'status',
    'reason', v_info->>'reason',
    'allowed', coalesce((v_info->>'allowed')::boolean, false),
    'in_grace', coalesce((v_info->>'in_grace')::boolean, false),
    'trial_ends_at', v_info->>'trial_ends_at',
    'paid_through', v_info->>'subscription_paid_through',
    'next_billing_at', v_sub.next_billing_at,
    'last_successful_payment_at', v_sub.last_payment_at,
    'last_payment_failed_at', v_sub.last_payment_failed_at,
    'grace_ends_at', v_sub.grace_ends_at,
    'access_until', v_info->>'access_until',
    'payment_grace_days', public.fire_s_payment_grace_days(),
    'cancel_keeps_access_until_paid_through', public.fire_s_cancel_keeps_access(),
    'keep_data', true,
    'can_subscribe', true,
    'can_cancel', public.fire_s_is_super_admin() or public.fire_s_can_manage_company(v_company),
    'authority', 'server'
  );
end;
$$;

revoke all on function public.fire_s_get_company_billing(uuid) from public;
revoke all on function public.fire_s_get_company_billing(uuid) from anon;
grant execute on function public.fire_s_get_company_billing(uuid) to authenticated;

comment on function public.fire_s_my_company() is
  'Primary company for this login. Prefers an owned cancelled/expired company so PayFast can resubscribe.';

comment on function public.fire_s_get_company_billing(uuid) is
  'Non-sensitive company billing. Never returns PayFast tokens or secrets. Cancelled companies stay readable.';

commit;

notify pgrst, 'reload schema';

select 'fire_s payfast resubscribe ready' as status;
