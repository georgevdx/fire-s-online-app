-- Open the existing company named Sample from the PayFast wallet credit
-- on 4 Nov 2026 at 17:56 Johannesburg (gross R250, net R238.50).
-- Run on live fireye-sync only. Does not delete inspections or companies.
-- Last cell should read: Sample:active until 2026-12-04 17:56

begin;

do $open$
declare
  v_company uuid;
  v_m text;
  v_start timestamptz := timestamptz '2026-11-04 17:56:09+02';
  v_end timestamptz := timestamptz '2026-11-04 17:56:09+02' + interval '1 month';
begin
  perform set_config('fire_s.entitlement_write', 'on', true);

  select c.id
    into v_company
    from public.companies c
   where lower(trim(c.name)) = 'sample'
   order by c.updated_at desc nulls last
   limit 1;

  if v_company is null then
    raise exception 'No company named Sample';
  end if;

  select e.m_payment_id
    into v_m
    from public.fire_s_payment_events e
   where e.company_id = v_company
     and e.event_type = 'checkout'
     and e.payment_status = 'payment_pending'
     and e.created_at >= timestamptz '2026-11-04 17:50:00+02'
   order by e.created_at desc
   limit 1;

  update public.fire_s_company_subscriptions s
     set status = 'active',
         provider = 'payfast',
         billing_interval = 'monthly',
         plan_code = coalesce(nullif(s.plan_code, ''), 'standard'),
         subscription_started_at = coalesce(s.subscription_started_at, v_start),
         current_period_start = v_start,
         current_period_end = v_end,
         cancelled_at = null,
         grace_ends_at = null,
         last_payment_failed_at = null,
         last_failed_payment_id = null,
         last_payment_at = v_start,
         next_billing_at = v_end,
         updated_at = now()
   where s.company_id = v_company;

  if not found then
    raise exception 'Sample has no subscription row';
  end if;

  perform public.fire_s_record_payment_event(
    v_company,
    'manual-sample-20261104-1756',
    v_m,
    250,
    'COMPLETE',
    'manual',
    jsonb_build_object(
      'source', 'payfast_wallet',
      'paid_at_johannesburg', '2026-11-04 17:56:09',
      'gross', 250,
      'net', 238.50,
      'keep_data', true
    ),
    null,
    'payfast',
    v_start
  );

  perform public.fire_s_audit_entitlement(
    v_company,
    'LIFECYCLE_REACTIVATE',
    jsonb_build_object(
      'source', 'payfast_wallet_2026_11_04_1756',
      'keep_data', true
    )
  );
end
$open$;

commit;

notify pgrst, 'reload schema';

select c.name || ':' || s.status || ' until ' || to_char(s.current_period_end at time zone 'Africa/Johannesburg', 'YYYY-MM-DD HH24:MI') as opened
  from public.companies c
  join public.fire_s_company_subscriptions s on s.company_id = c.id
 where lower(trim(c.name)) = 'sample';
