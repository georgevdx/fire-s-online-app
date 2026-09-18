-- Fire-S Test only. Sit live later.
-- Run AFTER SUPABASE_cancel_lock_inspections.sql.
--
-- The inspection block starts AFTER expiry (current_period_end).
-- For this test, move that date to yesterday so the block shows NOW.
-- Cloud inspection rows stay (keep_data). Nothing is deleted.

begin;

do $$
declare
  n int := 0;
  r record;
begin
  update public.fire_s_company_subscriptions s
     set current_period_end = now() - interval '1 day',
         next_billing_at = null,
         updated_at = now()
   where s.status = 'cancelled';

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'No cancelled subscription found. Cancel on Company billing first, then run this file again.';
  end if;

  for r in
    select s.company_id
      from public.fire_s_company_subscriptions s
     where s.status = 'cancelled'
  loop
    perform public.fire_s_refresh_entitlement_status(r.company_id);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';

select
  s.company_id,
  s.status,
  s.current_period_end as expiry_now_in_the_past,
  public.fire_s_compute_entitlement(s.company_id)->>'reason' as reason,
  public.fire_s_compute_entitlement(s.company_id)->>'can_read' as can_read,
  public.fire_s_compute_entitlement(s.company_id)->>'keep_data' as keep_data,
  (public.fire_s_compute_entitlement(s.company_id)->>'can_read')::boolean = false as block_is_on
from public.fire_s_company_subscriptions s
where s.status = 'cancelled';
