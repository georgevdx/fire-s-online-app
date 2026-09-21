-- Fire-S Test only. Do not run on live.
-- Undo of SUPABASE_test_cancelled_expiry_past.sql
--
-- That test file moved cancelled expiry to yesterday. This puts the
-- expiry back to the real paid-through date:
--   last successful payment + 1 month  (or + 1 year if the plan is annual)
--
-- Cancel still LOCKS inspections until a new subscription is active.
-- The date is only for billing. Inspections stay. Nothing is deleted.
-- Sit live later. Do not sit the yesterday-expiry test live.
--
-- 1. Open Fire-S Test → SQL Editor (the toets project, not live).
-- 2. Run this WHOLE file as-is. Do not change anything.
-- 3. Last table: expiry_restored is the real date, inspections_locked
--    is true, keep_data is true.

begin;

do $$
declare
  n int := 0;
  r record;
  v_anchor timestamptz;
  v_end timestamptz;
begin
  if not exists (
    select 1
      from public.fire_s_company_subscriptions s
     where s.status = 'cancelled'
  ) then
    raise exception 'No cancelled subscription found. Nothing to restore.';
  end if;

  for r in
    select
      s.id,
      s.company_id,
      s.billing_interval,
      s.last_payment_at,
      s.current_period_start,
      s.subscription_started_at,
      s.current_period_end
      from public.fire_s_company_subscriptions s
     where s.status = 'cancelled'
  loop
    v_anchor := coalesce(r.last_payment_at, r.current_period_start, r.subscription_started_at);
    if v_anchor is null then
      raise exception
        'Cancelled company % has no last payment or period start. Pay once, then run this file again.',
        r.company_id;
    end if;

    v_end := v_anchor + case
      when lower(coalesce(r.billing_interval, '')) = 'annual' then interval '1 year'
      else interval '1 month'
    end;

    update public.fire_s_company_subscriptions s
       set current_period_end = v_end,
           updated_at = now()
     where s.id = r.id
       and s.current_period_end is distinct from v_end;

    update public.companies c
       set subscription_paid_through = v_end,
           subscription_expires_at = v_end,
           updated_at = now()
     where c.id = r.company_id
       and (
         c.subscription_paid_through is distinct from v_end
         or c.subscription_expires_at is distinct from v_end
       );

    perform public.fire_s_refresh_entitlement_status(r.company_id);
    n := n + 1;
  end loop;

  if n = 0 then
    raise exception 'No cancelled subscription found. Nothing to restore.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

select
  s.company_id,
  s.status,
  s.billing_interval,
  s.last_payment_at,
  s.current_period_end as expiry_restored,
  public.fire_s_compute_entitlement(s.company_id)->>'reason' as reason,
  public.fire_s_compute_entitlement(s.company_id)->>'can_read' as can_read,
  public.fire_s_compute_entitlement(s.company_id)->>'keep_data' as keep_data,
  public.fire_s_compute_entitlement(s.company_id)->>'access_until' as access_until,
  (
    (public.fire_s_compute_entitlement(s.company_id)->>'can_read')::boolean = false
    and (public.fire_s_compute_entitlement(s.company_id)->>'keep_data')::boolean = true
  ) as inspections_locked
from public.fire_s_company_subscriptions s
where s.status = 'cancelled';
