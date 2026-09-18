-- Fire-S Test only. Sit live later.
-- Run AFTER SUPABASE_cancel_lock_inspections.sql if you need the cancel
-- lock to show NOW (paid-through / expiry already in the past).
--
-- Cancel keeps cloud rows. After current_period_end the app cannot open
-- old or new inspections until a new subscription is active.
-- This sets that expiry date to yesterday on cancelled Test subscriptions.

begin;

update public.fire_s_company_subscriptions s
   set current_period_end = now() - interval '1 day',
       next_billing_at = null,
       updated_at = now()
 where s.status = 'cancelled';

update public.companies c
   set subscription_paid_through = now() - interval '1 day',
       subscription_expires_at = now() - interval '1 day',
       entitlement_status = 'subscription_cancelled',
       entitlement_updated_at = now(),
       updated_at = now()
 where exists (
   select 1
     from public.fire_s_company_subscriptions s
    where s.company_id = c.id
      and s.status = 'cancelled'
 );

commit;

notify pgrst, 'reload schema';

select
  s.company_id,
  s.status,
  s.current_period_end,
  public.fire_s_compute_entitlement(s.company_id)->>'reason' as reason,
  public.fire_s_compute_entitlement(s.company_id)->>'can_read' as can_read,
  public.fire_s_compute_entitlement(s.company_id)->>'keep_data' as keep_data
from public.fire_s_company_subscriptions s
where s.status = 'cancelled';
