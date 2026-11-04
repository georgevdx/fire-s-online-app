-- Fire-S: open the existing company after a new PayFast payment.
-- Run on live fireye-sync (ispsdmglyylcwkufphnv). Does not delete inspections.
-- Result column opened = true means that company is active again.

begin;

create or replace function public.fire_s_payfast_explicit_reopen(
  p_company_id uuid,
  p_m_payment_id text,
  p_except_event uuid,
  p_cancelled_at timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_m text := nullif(trim(p_m_payment_id), '');
begin
  if p_company_id is null or p_cancelled_at is null or v_m is null then
    return false;
  end if;
  return exists (
    select 1
      from public.fire_s_payment_events e
     where e.company_id = p_company_id
       and e.m_payment_id = v_m
       and e.event_type = 'checkout'
       and e.payment_status = 'payment_pending'
       and e.created_at > p_cancelled_at
       and not exists (
         select 1
           from public.fire_s_payment_events done
          where done.company_id = p_company_id
            and done.m_payment_id = e.m_payment_id
            and done.payment_status = 'COMPLETE'
            and (p_except_event is null or done.id is distinct from p_except_event)
       )
  );
end;
$$;


create or replace function public.fire_s_reopen_paid_checkout(p_company_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.fire_s_company_subscriptions%rowtype;
  v_cancel_at timestamptz;
  v_checkout_at timestamptz;
  v_m text;
  v_paid public.fire_s_payment_events%rowtype;
  v_interval text;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_company_id is null then
    return false;
  end if;

  perform set_config('fire_s.entitlement_write', 'on', true);

  select s.*
    into v_sub
    from public.fire_s_company_subscriptions s
   where s.company_id = p_company_id
   for update;

  if v_sub.id is null or v_sub.status = 'active' then
    return false;
  end if;

  v_cancel_at := coalesce(
    v_sub.cancelled_at,
    (
      select max(a.created_at)
        from public.fire_s_entitlement_audit a
       where a.company_id = p_company_id
         and a.event in ('LIFECYCLE_CANCELLED', 'SUBSCRIPTION_CANCELLED')
    )
  );

  if v_cancel_at is null then
    return false;
  end if;

  select e.m_payment_id, e.created_at
    into v_m, v_checkout_at
    from public.fire_s_payment_events e
   where e.company_id = p_company_id
     and e.event_type = 'checkout'
     and e.payment_status = 'payment_pending'
     and e.m_payment_id is not null
     and e.created_at > v_cancel_at
   order by e.created_at desc
   limit 1;

  if v_m is null then
    return false;
  end if;

  select e.*
    into v_paid
    from public.fire_s_payment_events e
   where e.company_id = p_company_id
     and e.payment_status = 'COMPLETE'
     and (
       e.m_payment_id = v_m
       or (
         v_checkout_at is not null
         and e.created_at >= v_checkout_at
         and (
           e.amount is null
           or abs(e.amount - 250) <= 0.01
           or abs(e.amount - 2500) <= 0.01
         )
       )
     )
   order by case when e.m_payment_id = v_m then 0 else 1 end, e.created_at desc
   limit 1;

  if v_paid.id is null then
    return false;
  end if;

  v_interval := lower(coalesce(v_sub.billing_interval, 'monthly'));
  if v_paid.amount is not null and abs(v_paid.amount - 2500) <= 0.01 then
    v_interval := 'annual';
  elsif v_paid.amount is not null and abs(v_paid.amount - 250) <= 0.01 then
    v_interval := 'monthly';
  end if;
  if v_interval not in ('monthly', 'annual') then
    v_interval := 'monthly';
  end if;

  v_start := coalesce(v_paid.occurred_at, v_paid.created_at, now());
  v_end := v_start + case when v_interval = 'annual' then interval '1 year' else interval '1 month' end;

  update public.fire_s_company_subscriptions s
     set status = 'active',
         provider = 'payfast',
         billing_interval = v_interval,
         subscription_started_at = coalesce(s.subscription_started_at, v_start),
         current_period_start = v_start,
         current_period_end = v_end,
         cancelled_at = null,
         grace_ends_at = null,
         last_payment_failed_at = null,
         last_failed_payment_id = null,
         payfast_subscription_token = coalesce(nullif(trim(v_paid.payfast_token), ''), s.payfast_subscription_token),
         payfast_payment_id = coalesce(nullif(trim(v_paid.payfast_payment_id), ''), s.payfast_payment_id),
         last_payment_at = v_start,
         next_billing_at = v_end,
         updated_at = now()
   where s.id = v_sub.id;

  begin
    perform public.fire_s_audit_entitlement(
      p_company_id,
      'LIFECYCLE_REACTIVATE',
      jsonb_build_object(
        'source', 'reopen_paid_checkout',
        'm_payment_id', v_m,
        'payfast_payment_id', v_paid.payfast_payment_id,
        'keep_data', true
      )
    );
  exception when others then
    null;
  end;

  return true;
end;
$$;


create or replace function public.fire_s_refresh_entitlement_status(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_info jsonb;
  v_status text;
  v_reason text;
  v_used int;
  v_prev text;
begin
  perform set_config('fire_s.entitlement_write', 'on', true);
  begin
    perform public.fire_s_reopen_paid_checkout(p_company_id);
  exception when others then
    null;
  end;
  v_info := public.fire_s_compute_entitlement(p_company_id);
  v_status := v_info->>'status';
  v_reason := v_info->>'reason';
  v_used := coalesce((v_info->>'trial_inspections_used')::int, 0);

  select c.entitlement_status into v_prev
  from public.companies c
  where c.id = p_company_id;

  update public.companies c
     set entitlement_status = v_status,
         trial_inspections_used = v_used,
         entitlement_updated_at = now(),
         updated_at = now()
   where c.id = p_company_id;

  if v_reason = 'trial_limit_reached' and coalesce(v_prev, '') is distinct from 'trial_limit_reached' then
    perform public.fire_s_audit_entitlement(p_company_id, 'TRIAL_LIMIT_REACHED', v_info);
  elsif v_reason = 'trial_expired' and coalesce(v_prev, '') is distinct from 'trial_expired' then
    perform public.fire_s_audit_entitlement(p_company_id, 'TRIAL_EXPIRED', v_info);
  end if;

  return v_info;
end;
$$;


revoke all on function public.fire_s_payfast_explicit_reopen(uuid, text, uuid, timestamptz) from public;
revoke all on function public.fire_s_payfast_explicit_reopen(uuid, text, uuid, timestamptz) from anon;
revoke all on function public.fire_s_payfast_explicit_reopen(uuid, text, uuid, timestamptz) from authenticated;
grant execute on function public.fire_s_payfast_explicit_reopen(uuid, text, uuid, timestamptz) to service_role;

revoke all on function public.fire_s_reopen_paid_checkout(uuid) from public;
revoke all on function public.fire_s_reopen_paid_checkout(uuid) from anon;
revoke all on function public.fire_s_reopen_paid_checkout(uuid) from authenticated;
grant execute on function public.fire_s_reopen_paid_checkout(uuid) to service_role;

commit;

notify pgrst, 'reload schema';

select coalesce(
  (
    select c.name || ':' || public.fire_s_reopen_paid_checkout(c.id)::text
      from public.companies c
     where lower(trim(c.name)) = 'sample'
     order by c.updated_at desc nulls last
     limit 1
  ),
  'no company named Sample'
) as opened;
