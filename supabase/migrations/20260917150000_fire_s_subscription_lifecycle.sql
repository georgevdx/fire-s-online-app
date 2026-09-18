-- Fire-S Phase 8: subscription lifecycle + grace period + company billing
-- Run AFTER SUPABASE_company_trial.sql on Fire-S Test.
--
-- Transitions happen only in this SQL (ITN / cancel RPCs). Browser clock
-- and localStorage cannot activate, cancel, or extend access.
-- One failed payment does not delete data. Cancel keeps rows in the cloud
-- but locks app inspection access until a new subscription is active.
-- Sit live later.

begin;

alter table public.fire_s_entitlement_config
  add column if not exists payment_grace_days integer;
alter table public.fire_s_entitlement_config
  add column if not exists cancel_keeps_access_until_paid_through boolean;

update public.fire_s_entitlement_config
   set payment_grace_days = coalesce(payment_grace_days, 7),
       cancel_keeps_access_until_paid_through = false,
       updated_at = now()
 where id = 1;

alter table public.fire_s_entitlement_config
  alter column payment_grace_days set default 7;
alter table public.fire_s_entitlement_config
  alter column payment_grace_days set not null;
alter table public.fire_s_entitlement_config
  alter column cancel_keeps_access_until_paid_through set default false;
alter table public.fire_s_entitlement_config
  alter column cancel_keeps_access_until_paid_through set not null;

alter table public.fire_s_entitlement_config
  drop constraint if exists fire_s_entitlement_config_grace_chk;
alter table public.fire_s_entitlement_config
  add constraint fire_s_entitlement_config_grace_chk
  check (payment_grace_days >= 0);

alter table public.fire_s_company_subscriptions
  add column if not exists grace_ends_at timestamptz;
alter table public.fire_s_company_subscriptions
  add column if not exists last_payment_failed_at timestamptz;
alter table public.fire_s_company_subscriptions
  add column if not exists last_failed_payment_id text;

comment on column public.fire_s_entitlement_config.payment_grace_days is
  'Days of paid access after a failed renewal. One row, not scattered in app code.';
comment on column public.fire_s_entitlement_config.cancel_keeps_access_until_paid_through is
  'Always false for inspection access. Cancel keeps cloud rows (keep_data) but locks the app until a new subscription is active.';

create or replace function public.fire_s_payment_grace_days()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.payment_grace_days from public.fire_s_entitlement_config c where c.id = 1),
    7
  );
$$;

create or replace function public.fire_s_cancel_keeps_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.cancel_keeps_access_until_paid_through from public.fire_s_entitlement_config c where c.id = 1),
    false
  );
$$;

create or replace function public.fire_s_subscription_access_until(p_company_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sub public.fire_s_company_subscriptions%rowtype;
  v_period timestamptz;
  v_now timestamptz := now();
begin
  if p_company_id is null then
    return null;
  end if;

  select s.* into v_sub
    from public.fire_s_company_subscriptions s
   where s.company_id = p_company_id;

  v_period := v_sub.current_period_end;

  if v_sub.status = 'active' then
    return v_period;
  end if;
  if v_sub.status = 'past_due' then
    return coalesce(v_sub.grace_ends_at, v_period);
  end if;
  if v_sub.status = 'cancelled' then
    return null;
  end if;
  if v_sub.status = 'trialing' then
    return v_sub.trial_ends_at;
  end if;
  return null;
end;
$$;

create or replace function public.fire_s_compute_entitlement(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.companies%rowtype;
  v_sub public.fire_s_company_subscriptions%rowtype;
  v_now timestamptz := now();
  v_used int := 0;
  v_limit int := public.fire_s_entitlement_limit();
  v_days int := 0;
  v_remaining_insp int := 0;
  v_status text := 'subscription_required';
  v_reason text := 'subscription_required';
  v_allowed boolean := false;
  v_can_finalise boolean := false;
  v_can_create boolean := false;
  v_can_draft boolean := false;
  v_can_read boolean := false;
  v_can_export boolean := false;
  v_paid boolean := false;
  v_ends timestamptz;
  v_period timestamptz;
  v_access timestamptz;
  v_in_grace boolean := false;
  v_sub_status text;
begin
  if p_company_id is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'subscription_required',
      'status', 'subscription_required',
      'trial_days_remaining', 0,
      'trial_inspections_remaining', 0,
      'trial_inspections_used', 0,
      'trial_inspection_limit', v_limit,
      'keep_data', true,
      'can_create', false,
      'can_finalise', false,
      'can_write_draft', false,
      'can_read', false,
      'can_export', false,
      'server_now', v_now,
      'clock', 'server',
      'payment_grace_days', public.fire_s_payment_grace_days()
    );
  end if;

  select * into v_row from public.companies c where c.id = p_company_id;
  if not found then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'subscription_required',
      'status', 'subscription_required',
      'keep_data', true,
      'can_create', false,
      'can_finalise', false,
      'can_write_draft', false,
      'can_read', false,
      'can_export', false,
      'server_now', v_now,
      'clock', 'server'
    );
  end if;

  select s.* into v_sub
    from public.fire_s_company_subscriptions s
   where s.company_id = p_company_id;

  v_used := public.fire_s_count_finalised_inspections(p_company_id);
  v_limit := coalesce(v_row.trial_inspection_limit, v_limit, 3);
  v_remaining_insp := greatest(v_limit - v_used, 0);
  v_ends := coalesce(v_row.trial_ends_at, v_row.trial_expires_at, v_sub.trial_ends_at);
  v_period := coalesce(v_sub.current_period_end, v_row.subscription_paid_through, v_row.subscription_expires_at);
  v_sub_status := coalesce(v_sub.status, public.fire_s_map_internal_subscription_status(
    v_row.subscription_status,
    v_row.entitlement_status,
    v_row.trial_started_at,
    coalesce(v_row.trial_ends_at, v_row.trial_expires_at),
    v_now
  ));
  v_access := public.fire_s_subscription_access_until(p_company_id);

  if v_ends is not null then
    v_days := greatest(ceil(extract(epoch from (v_ends - v_now)) / 86400.0)::int, 0);
  end if;

  if v_sub_status = 'past_due' and v_access is not null and v_now < v_access then
    v_status := 'subscription_past_due';
    v_reason := 'past_due_grace';
    v_allowed := true;
    v_can_finalise := true;
    v_can_create := true;
    v_in_grace := true;
  elsif v_sub_status = 'past_due' then
    v_status := 'subscription_past_due';
    v_reason := 'subscription_required';
  elsif v_sub_status = 'cancelled' then
    v_status := 'subscription_cancelled';
    v_reason := 'subscription_required';
  elsif v_sub_status = 'active'
        and (v_period is null or v_now < v_period) then
    v_status := 'subscription_active';
    v_reason := null;
    v_allowed := true;
    v_can_finalise := true;
    v_can_create := true;
  elsif coalesce(v_row.entitlement_status, '') = 'subscription_active'
        and v_sub_status not in ('past_due', 'cancelled', 'expired') then
    v_status := 'subscription_active';
    v_reason := null;
    v_allowed := true;
    v_can_finalise := true;
    v_can_create := true;
  elsif v_row.trial_started_at is not null then
    if v_now >= coalesce(v_ends, v_row.trial_started_at) then
      v_status := 'trial_expired';
      v_reason := 'trial_expired';
      v_days := 0;
    elsif v_used >= v_limit then
      v_status := 'trial_active';
      v_reason := 'trial_limit_reached';
    else
      v_status := 'trial_active';
      v_reason := null;
      v_allowed := true;
      v_can_finalise := true;
      v_can_create := true;
    end if;
  else
    v_status := coalesce(nullif(v_row.entitlement_status, ''), 'subscription_required');
    v_reason := 'subscription_required';
  end if;

  if v_reason = 'trial_limit_reached' then
    v_allowed := false;
    v_can_finalise := false;
    v_can_create := true;
    v_can_draft := true;
    v_can_read := true;
    v_can_export := true;
  elsif v_reason = 'subscription_required' or v_reason = 'trial_expired' then
    v_allowed := false;
    v_can_finalise := false;
    v_can_create := false;
    v_can_draft := false;
    v_can_read := false;
    v_can_export := false;
  elsif v_allowed then
    v_can_read := true;
    v_can_export := true;
    v_can_draft := true;
  else
    v_can_draft := false;
    v_can_read := false;
    v_can_export := false;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'status', v_status,
    'trial_days_remaining', v_days,
    'trial_inspections_remaining', v_remaining_insp,
    'trial_inspections_used', v_used,
    'trial_inspection_limit', v_limit,
    'trial_started_at', v_row.trial_started_at,
    'trial_ends_at', v_ends,
    'trial_expires_at', v_ends,
    'plan', coalesce(v_sub.plan_code, v_row.subscription_plan_id, v_row.plan, 'standard'),
    'billing_interval', coalesce(v_sub.billing_interval, v_row.billing_interval),
    'subscription_status', coalesce(v_sub.status, v_row.subscription_status),
    'subscription_paid_through', v_period,
    'subscription_expires_at', v_period,
    'next_billing_at', v_sub.next_billing_at,
    'last_payment_at', v_sub.last_payment_at,
    'last_payment_failed_at', v_sub.last_payment_failed_at,
    'grace_ends_at', v_sub.grace_ends_at,
    'access_until', v_access,
    'in_grace', v_in_grace,
    'payment_grace_days', public.fire_s_payment_grace_days(),
    'can_finalise', v_can_finalise,
    'can_create', v_can_create,
    'can_write_draft', v_can_draft,
    'keep_data', true,
    'can_read', v_can_read,
    'can_export', v_can_export,
    'server_now', v_now,
    'clock', 'server',
    'company_id', p_company_id
  );
end;
$$;

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
  v_from_status text;
  v_kind text;
  v_token_changed boolean := false;
  v_grace int := public.fire_s_payment_grace_days();
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

  v_from_status := v_sub.status;

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

  if v_token is not null
     and v_sub.payfast_subscription_token is not null
     and v_token is distinct from v_sub.payfast_subscription_token then
    v_token_changed := true;
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
  end if;

  if not v_already then
    if v_status = 'COMPLETE' then
      v_kind := case
        when v_from_status in ('cancelled', 'expired') then 'LIFECYCLE_REACTIVATE'
        when v_from_status in ('active', 'past_due')
         and v_sub.current_period_end is not null
         and v_sub.current_period_end > now() then 'LIFECYCLE_RECURRING'
        else 'LIFECYCLE_INITIAL'
      end;
      v_start := case
        when v_kind = 'LIFECYCLE_RECURRING' then v_sub.current_period_end
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
             grace_ends_at = null,
             last_payment_failed_at = null,
             last_failed_payment_id = null,
             payfast_subscription_token = coalesce(v_token, s.payfast_subscription_token),
             payfast_payment_id = v_pf,
             last_payment_at = now(),
             next_billing_at = v_next,
             updated_at = now()
       where s.id = v_sub.id;
      v_applied := true;
      v_extended := true;
      v_new_status := 'active';
      v_audit := v_kind;
    elsif v_status = 'FAILED' then
      update public.fire_s_company_subscriptions s
         set status = case
               when s.status in ('cancelled', 'expired', 'trialing') then s.status
               else 'past_due'
             end,
             provider = 'payfast',
             grace_ends_at = coalesce(
               s.grace_ends_at,
               greatest(coalesce(s.current_period_end, now()), now())
                 + make_interval(days => v_grace)
             ),
             last_payment_failed_at = now(),
             last_failed_payment_id = v_pf,
             payfast_subscription_token = coalesce(v_token, s.payfast_subscription_token),
             payfast_payment_id = coalesce(s.payfast_payment_id, v_pf),
             updated_at = now()
       where s.id = v_sub.id
      returning s.status into v_new_status;
      v_applied := true;
      v_extended := false;
      v_audit := 'LIFECYCLE_FAILED_GRACE';
    else
      update public.fire_s_company_subscriptions s
         set status = 'cancelled',
             provider = 'payfast',
             cancelled_at = coalesce(s.cancelled_at, now()),
             next_billing_at = null,
             payfast_subscription_token = coalesce(v_token, s.payfast_subscription_token),
             payfast_payment_id = coalesce(s.payfast_payment_id, v_pf),
             updated_at = now()
       where s.id = v_sub.id;
      v_applied := true;
      v_extended := false;
      v_new_status := 'cancelled';
      v_audit := 'LIFECYCLE_CANCELLED';
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
        'from_status', v_from_status,
        'to_status', coalesce(v_new_status, v_sub.status),
        'applied', v_applied,
        'extended', v_extended,
        'duplicate', v_duplicate,
        'already_processed', v_already,
        'token_changed', v_token_changed,
        'payment_grace_days', v_grace,
        'keep_data', true
      )
    );
    if v_token_changed and not v_already then
      perform public.fire_s_audit_entitlement(
        v_company,
        'LIFECYCLE_TOKEN_CHANGED',
        jsonb_build_object('keep_data', true, 'subscription_id', v_sub.id)
      );
    end if;
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'applied', v_applied,
    'extended', v_extended,
    'duplicate', v_duplicate,
    'already_processed', v_already,
    'token_changed', v_token_changed,
    'company_id', v_company,
    'subscription_id', v_sub.id,
    'payment_event_id', v_event,
    'm_payment_id', v_m,
    'payfast_payment_id', v_pf,
    'payment_status', v_status,
    'from_status', v_from_status,
    'status', coalesce(v_new_status, v_sub.status),
    'billing_interval', v_interval,
    'current_period_end', v_end,
    'deleted_inspections', false,
    'keep_data', true
  );
end;
$$;

create or replace function public.fire_s_cancel_company_subscription()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.company_id, m.role
    into v_company, v_role
  from public.company_members m
  where m.user_id = v_uid
    and coalesce(m.status, 'active') = 'active'
    and m.role in ('company_owner', 'owner', 'super_admin')
  order by case m.role when 'company_owner' then 0 else 1 end
  limit 1;

  if v_company is null and public.fire_s_is_super_admin() then
    select m.company_id into v_company
    from public.company_members m
    where m.user_id = v_uid
      and coalesce(m.status, 'active') = 'active'
    limit 1;
  end if;

  if v_company is null then
    raise exception 'Only the Owner can cancel this subscription';
  end if;

  perform set_config('fire_s.entitlement_write', 'on', true);

  update public.fire_s_company_subscriptions s
     set status = 'cancelled',
         cancelled_at = coalesce(s.cancelled_at, now()),
         next_billing_at = null,
         updated_at = now()
   where s.company_id = v_company
     and s.status is distinct from 'cancelled';

  update public.companies c
     set subscription_status = 'cancelled',
         billing_status = 'cancelled',
         entitlement_status = 'subscription_cancelled',
         entitlement_updated_at = now(),
         updated_at = now()
   where c.id = v_company;

  perform public.fire_s_audit_entitlement(
    v_company,
    'LIFECYCLE_CANCELLED',
    jsonb_build_object(
      'keep_data', true,
      'access_until', public.fire_s_subscription_access_until(v_company),
      'cancel_keeps_access_until_paid_through', public.fire_s_cancel_keeps_access()
    )
  );

  return public.fire_s_refresh_entitlement_status(v_company);
end;
$$;

create or replace function public.fire_s_get_company_billing(p_company_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := p_company_id;
  v_sub public.fire_s_company_subscriptions%rowtype;
  v_info jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_company is null then
    select m.company_id into v_company
    from public.company_members m
    where m.user_id = v_uid
      and coalesce(m.status, 'active') = 'active'
    order by case m.role when 'company_owner' then 0 when 'owner' then 1 else 2 end
    limit 1;
  end if;

  if v_company is null then
    raise exception 'Company required';
  end if;

  if not public.fire_s_is_super_admin()
     and not public.fire_s_is_company_member(v_company) then
    raise exception 'Not allowed to read another company billing';
  end if;

  select s.* into v_sub
    from public.fire_s_company_subscriptions s
   where s.company_id = v_company;

  v_info := public.fire_s_get_company_entitlement(v_company);

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

revoke all on function public.fire_s_apply_payfast_itn(text, text, text, numeric, uuid, text, text, text, jsonb) from public;
revoke all on function public.fire_s_apply_payfast_itn(text, text, text, numeric, uuid, text, text, text, jsonb) from anon;
revoke all on function public.fire_s_apply_payfast_itn(text, text, text, numeric, uuid, text, text, text, jsonb) from authenticated;
grant execute on function public.fire_s_apply_payfast_itn(text, text, text, numeric, uuid, text, text, text, jsonb) to service_role;

revoke all on function public.fire_s_payment_grace_days() from public;
revoke all on function public.fire_s_payment_grace_days() from anon;
grant execute on function public.fire_s_payment_grace_days() to authenticated;
grant execute on function public.fire_s_payment_grace_days() to service_role;

revoke all on function public.fire_s_cancel_keeps_access() from public;
revoke all on function public.fire_s_cancel_keeps_access() from anon;
grant execute on function public.fire_s_cancel_keeps_access() to authenticated;
grant execute on function public.fire_s_cancel_keeps_access() to service_role;

revoke all on function public.fire_s_subscription_access_until(uuid) from public;
revoke all on function public.fire_s_subscription_access_until(uuid) from anon;
grant execute on function public.fire_s_subscription_access_until(uuid) to authenticated;
grant execute on function public.fire_s_subscription_access_until(uuid) to service_role;

revoke all on function public.fire_s_get_company_billing(uuid) from public;
revoke all on function public.fire_s_get_company_billing(uuid) from anon;
grant execute on function public.fire_s_get_company_billing(uuid) to authenticated;

revoke all on function public.fire_s_cancel_company_subscription() from public;
grant execute on function public.fire_s_cancel_company_subscription() to authenticated;

revoke all on function public.fire_s_compute_entitlement(uuid) from public;
revoke all on function public.fire_s_compute_entitlement(uuid) from anon;
revoke all on function public.fire_s_compute_entitlement(uuid) from authenticated;

-- Hide PayFast tokens from the browser. Billing page uses the RPC above.
revoke select on table public.fire_s_company_subscriptions from authenticated;
grant select (
  id,
  company_id,
  provider,
  plan_code,
  billing_interval,
  status,
  trial_started_at,
  trial_ends_at,
  subscription_started_at,
  current_period_start,
  current_period_end,
  cancelled_at,
  last_payment_at,
  next_billing_at,
  grace_ends_at,
  last_payment_failed_at,
  created_at,
  updated_at
) on table public.fire_s_company_subscriptions to authenticated;

comment on function public.fire_s_get_company_billing(uuid) is
  'Non-sensitive company billing. Never returns PayFast tokens or secrets.';

commit;

notify pgrst, 'reload schema';

select 'fire_s subscription lifecycle ready' as status;
