-- Fire-S Phase 5: apply a verified PayFast ITN
-- Run AFTER SUPABASE_payfast_checkout.sql on Fire-S Test.
-- service_role only. The Edge Function must already have verified:
--   signature, PayFast origin, /eng/query/validate = VALID, required fields.
-- This RPC still re-checks company/reference and the SERVER-SIDE plan price.
-- Idempotent: the same pf_payment_id + payment_status never extends access twice
-- and never inserts a second payment row.
-- Does not delete inspections, companies, photos, or reports.

begin;

create or replace function public.fire_s_apply_payfast_itn(
  p_m_payment_id text,
  p_payfast_payment_id text,
  p_payment_status text,
  p_amount numeric,
  p_company_id uuid default null,
  p_token text default null,
  p_plan_code text default 'standard',
  p_billing_interval text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m text := nullif(trim(p_m_payment_id), '');
  v_pf text := nullif(trim(p_payfast_payment_id), '');
  v_status text := upper(nullif(trim(p_payment_status), ''));
  v_token text := nullif(trim(p_token), '');
  v_plan text := lower(nullif(trim(p_plan_code), ''));
  v_interval text := lower(nullif(trim(p_billing_interval), ''));
  v_company uuid := p_company_id;
  v_from_m uuid;
  v_from_token uuid;
  v_sub public.fire_s_company_subscriptions%rowtype;
  v_existing public.fire_s_payment_events%rowtype;
  v_event uuid;
  v_expected numeric;
  v_start timestamptz;
  v_end timestamptz;
  v_next timestamptz;
  v_applied boolean := false;
  v_extended boolean := false;
  v_duplicate boolean := false;
  v_already boolean := false;
  v_audit text;
  v_new_status text;
begin
  if v_pf is null or length(v_pf) < 3 then
    raise exception 'Unknown company or payment reference';
  end if;
  if v_status is null or v_status not in ('COMPLETE', 'FAILED', 'CANCELLED') then
    raise exception 'Unknown company or payment reference';
  end if;

  if v_plan is null or v_plan not in ('standard', 'seat') then
    v_plan := 'standard';
  end if;

  select e.company_id
    into v_from_m
    from public.fire_s_payment_events e
   where v_m is not null
     and e.m_payment_id = v_m
   order by e.created_at desc
   limit 1;

  if v_token is not null then
    select s.company_id
      into v_from_token
      from public.fire_s_company_subscriptions s
     where s.payfast_subscription_token = v_token
     limit 1;
  end if;

  if v_from_m is null and v_from_token is null then
    raise exception 'Unknown company or payment reference';
  end if;

  if v_from_m is not null and v_from_token is not null and v_from_m <> v_from_token then
    raise exception 'Company does not match payment reference';
  end if;

  v_company := coalesce(v_from_m, v_from_token);

  if p_company_id is not null and p_company_id <> v_company then
    raise exception 'Company does not match payment reference';
  end if;

  if not exists (select 1 from public.companies c where c.id = v_company) then
    raise exception 'Unknown company or payment reference';
  end if;

  perform set_config('fire_s.entitlement_write', 'on', true);

  select *
    into v_existing
    from public.fire_s_payment_events e
   where e.provider = 'payfast'
     and e.payfast_payment_id = v_pf
     and e.payment_status = v_status
   limit 1;

  select s.*
    into v_sub
    from public.fire_s_company_subscriptions s
   where s.company_id = v_company
   for update;

  if not found then
    perform public.fire_s_sync_subscription_from_company(v_company);
    select s.*
      into v_sub
      from public.fire_s_company_subscriptions s
     where s.company_id = v_company
     for update;
  end if;

  if v_sub.id is null then
    raise exception 'Unknown company or payment reference';
  end if;

  if v_interval is null or v_interval not in ('monthly', 'annual') then
    v_interval := coalesce(v_sub.billing_interval, 'monthly');
  end if;
  if v_interval not in ('monthly', 'annual') then
    v_interval := 'monthly';
  end if;

  v_expected := case when v_interval = 'annual' then 2500 else 250 end;

  if v_status in ('COMPLETE', 'FAILED') then
    if p_amount is null or abs(p_amount - v_expected) > 0.01 then
      raise exception 'Authoritative amount mismatch';
    end if;
  elsif p_amount is not null and p_amount > 0 and abs(p_amount - v_expected) > 0.01 then
    raise exception 'Authoritative amount mismatch';
  end if;

  if v_existing.id is not null and v_existing.processed_at is not null then
    v_duplicate := true;
    v_already := true;
    v_event := v_existing.id;
    v_audit := 'ITN_ALREADY_PROCESSED';
  elsif v_sub.payfast_payment_id is not distinct from v_pf
     and (
       (v_status = 'COMPLETE' and v_sub.status = 'active')
       or (v_status = 'FAILED' and v_sub.status = 'past_due')
       or (v_status = 'CANCELLED' and v_sub.status = 'cancelled')
     ) then
    v_duplicate := true;
    v_already := true;
    if v_existing.id is not null then
      v_event := v_existing.id;
      perform public.fire_s_mark_payment_event_processed(v_event);
    end if;
    v_audit := 'ITN_ALREADY_PROCESSED';
  else
    begin
      v_event := public.fire_s_record_payment_event(
        v_company,
        v_pf,
        v_m,
        coalesce(p_amount, v_expected),
        v_status,
        'itn',
        coalesce(p_payload, '{}'::jsonb),
        v_token,
        'payfast',
        now()
      );
    exception when unique_violation then
      select e.*
        into v_existing
        from public.fire_s_payment_events e
       where e.provider = 'payfast'
         and e.payfast_payment_id = v_pf
         and e.payment_status = v_status
       limit 1;
      v_event := v_existing.id;
      if v_existing.processed_at is not null then
        v_duplicate := true;
        v_already := true;
        v_audit := 'ITN_ALREADY_PROCESSED';
      end if;
    end;

    if not v_already then
      if v_existing.id is not null and v_existing.processed_at is not null then
        v_duplicate := true;
        v_already := true;
        v_audit := 'ITN_ALREADY_PROCESSED';
      end if;
    end if;
  end if;

  if not v_already then
    if v_status = 'COMPLETE' then
      v_start := case
        when v_sub.status = 'active'
         and v_sub.current_period_end is not null
         and v_sub.current_period_end > now()
          then v_sub.current_period_end
        else now()
      end;
      v_end := v_start + case when v_interval = 'annual' then interval '1 year' else interval '1 month' end;
      v_next := v_end;
      update public.fire_s_company_subscriptions s
         set status = 'active',
             provider = 'payfast',
             plan_code = v_plan,
             billing_interval = v_interval,
             subscription_started_at = coalesce(s.subscription_started_at, now()),
             current_period_start = v_start,
             current_period_end = v_end,
             cancelled_at = null,
             payfast_subscription_token = coalesce(v_token, s.payfast_subscription_token),
             payfast_payment_id = v_pf,
             last_payment_at = now(),
             next_billing_at = v_next,
             updated_at = now()
       where s.id = v_sub.id;
      v_applied := true;
      v_extended := true;
      v_new_status := 'active';
      v_audit := 'ITN_COMPLETE';
    elsif v_status = 'FAILED' then
      update public.fire_s_company_subscriptions s
         set status = case
               when s.status in ('cancelled', 'expired') then s.status
               else 'past_due'
             end,
             provider = 'payfast',
             payfast_subscription_token = coalesce(v_token, s.payfast_subscription_token),
             payfast_payment_id = v_pf,
             updated_at = now()
       where s.id = v_sub.id
      returning s.status into v_new_status;
      v_applied := true;
      v_extended := false;
      v_audit := 'ITN_FAILED';
    else
      update public.fire_s_company_subscriptions s
         set status = 'cancelled',
             provider = 'payfast',
             cancelled_at = coalesce(s.cancelled_at, now()),
             payfast_subscription_token = coalesce(v_token, s.payfast_subscription_token),
             payfast_payment_id = v_pf,
             updated_at = now()
       where s.id = v_sub.id;
      v_applied := true;
      v_extended := false;
      v_new_status := 'cancelled';
      v_audit := 'ITN_CANCELLED';
    end if;

    if v_event is not null then
      perform public.fire_s_mark_payment_event_processed(v_event);
    end if;
  else
    select s.status into v_new_status
      from public.fire_s_company_subscriptions s
     where s.id = v_sub.id;
  end if;

  begin
    perform public.fire_s_audit_entitlement(
      v_company,
      v_audit,
      jsonb_build_object(
        'm_payment_id', v_m,
        'payfast_payment_id', v_pf,
        'payment_status', v_status,
        'amount', p_amount,
        'expected_amount', v_expected,
        'billing_interval', v_interval,
        'payment_event_id', v_event,
        'subscription_id', v_sub.id,
        'applied', v_applied,
        'extended', v_extended,
        'duplicate', v_duplicate,
        'already_processed', v_already,
        'keep_data', true
      )
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'applied', v_applied,
    'extended', v_extended,
    'duplicate', v_duplicate,
    'already_processed', v_already,
    'company_id', v_company,
    'subscription_id', v_sub.id,
    'payment_event_id', v_event,
    'm_payment_id', v_m,
    'payfast_payment_id', v_pf,
    'payment_status', v_status,
    'status', coalesce(v_new_status, v_sub.status),
    'current_period_end', v_end,
    'deleted_inspections', false
  );
end;
$$;

revoke all on function public.fire_s_apply_payfast_itn(text, text, text, numeric, uuid, text, text, text, jsonb) from public;
revoke all on function public.fire_s_apply_payfast_itn(text, text, text, numeric, uuid, text, text, text, jsonb) from anon;
revoke all on function public.fire_s_apply_payfast_itn(text, text, text, numeric, uuid, text, text, text, jsonb) from authenticated;
grant execute on function public.fire_s_apply_payfast_itn(text, text, text, numeric, uuid, text, text, text, jsonb) to service_role;

commit;

notify pgrst, 'reload schema';

select 'fire_s payfast itn apply ready' as status;
