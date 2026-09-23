-- Fire-S Step 6 check — LIVE project ispsdmglyylcwkufphnv only.
-- Read-only. Does not change data. Does not delete inspections.
--
-- Paste into SQL Editor, Run, and keep the inspection_rows number.
-- Run again after the Step 6 scripts. inspection_rows must stay the same.

select
  current_database() as database_name,
  (select count(*) from public.inspections) as inspection_rows,
  to_regclass('public.fire_s_entitlement_config') is not null as has_entitlement_config,
  to_regclass('public.fire_s_company_subscriptions') is not null as has_subscriptions,
  to_regclass('public.fire_s_payment_events') is not null as has_payment_events,
  to_regclass('public.fire_s_payfast_checkout_intent') is not null as has_checkout_intent,
  to_regprocedure('public.fire_s_begin_payfast_checkout(uuid, text, text, text, numeric, text, uuid)') is not null as has_begin_checkout,
  to_regprocedure('public.fire_s_apply_payfast_itn(text, text, text, numeric, uuid, text, text, text, jsonb)') is not null as has_apply_itn,
  to_regprocedure('public.fire_s_get_company_entitlement(uuid)') is not null as has_get_entitlement,
  to_regprocedure('public.fire_s_get_company_billing(uuid)') is not null as has_get_billing,
  to_regprocedure('public.fire_s_my_company()') is not null as has_my_company,
  to_regprocedure('public.fire_s_prepare_payfast_company(uuid, text)') is not null as has_prepare;
