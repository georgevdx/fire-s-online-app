-- Fire-S company trial + subscription entitlement
-- Run once in Supabase SQL Editor on LIVE and on Fire-S Test.
--
-- Source of truth for trial length and inspection limit:
--   public.fire_s_entitlement_config (one row, id = 1)
-- Change trial_inspection_limit / trial_days there. Do not scatter those
-- values in application code.
--
-- This script is additive. It does not drop inspections, companies, photos,
-- or reports. Existing companies are grandfathered as subscription_active
-- so current customers are not locked out. NEW companies receive one
-- 14-day trial that is never reset from the browser.

begin;

-- ---------------------------------------------------------------------------
-- 0) Central configuration (single source of truth)
-- ---------------------------------------------------------------------------
create table if not exists public.fire_s_entitlement_config (
  id smallint primary key default 1 check (id = 1),
  trial_days integer not null default 14 check (trial_days > 0),
  trial_inspection_limit integer not null default 3 check (trial_inspection_limit >= 0),
  updated_at timestamptz not null default now()
);

insert into public.fire_s_entitlement_config (id, trial_days, trial_inspection_limit)
values (1, 14, 3)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1) Company entitlement columns (reuse companies; do not duplicate tables)
-- ---------------------------------------------------------------------------
alter table public.companies add column if not exists trial_started_at timestamptz;
alter table public.companies add column if not exists trial_expires_at timestamptz;
alter table public.companies add column if not exists trial_inspection_limit integer;
alter table public.companies add column if not exists trial_inspections_used integer not null default 0;
alter table public.companies add column if not exists entitlement_status text;
alter table public.companies add column if not exists subscription_status text;
alter table public.companies add column if not exists subscription_plan_id text;
alter table public.companies add column if not exists subscription_started_at timestamptz;
alter table public.companies add column if not exists subscription_expires_at timestamptz;
alter table public.companies add column if not exists subscription_paid_through timestamptz;
alter table public.companies add column if not exists payment_reference text;
alter table public.companies add column if not exists payment_verified_at timestamptz;
alter table public.companies add column if not exists billing_status text;
alter table public.companies add column if not exists billing_renews_on date;
alter table public.companies add column if not exists billing_interval text;
alter table public.companies add column if not exists entitlement_updated_at timestamptz;
alter table public.companies add column if not exists updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2) Finalised-inspection claims (one row per inspection; no double count)
-- ---------------------------------------------------------------------------
create table if not exists public.fire_s_trial_finalised_inspections (
  inspection_id text not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  finalised_at timestamptz not null default now(),
  primary key (company_id, inspection_id)
);

create index if not exists fire_s_trial_finalised_company_idx
  on public.fire_s_trial_finalised_inspections (company_id);

-- ---------------------------------------------------------------------------
-- 3) Audit log (no secrets)
-- ---------------------------------------------------------------------------
create table if not exists public.fire_s_entitlement_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,
  actor_user_id uuid,
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fire_s_entitlement_audit_company_idx
  on public.fire_s_entitlement_audit (company_id, created_at desc);

create index if not exists fire_s_entitlement_audit_event_idx
  on public.fire_s_entitlement_audit (event, created_at desc);

-- ---------------------------------------------------------------------------
-- 4) Helpers
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'super_admin'
  );
$$;

create or replace function public.fire_s_entitlement_write_enabled()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('fire_s.entitlement_write', true), '') = 'on';
$$;

create or replace function public.fire_s_audit_entitlement(
  p_company_id uuid,
  p_event text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fire_s_entitlement_audit (company_id, actor_user_id, event, metadata)
  values (
    p_company_id,
    auth.uid(),
    left(coalesce(p_event, 'UNKNOWN'), 80),
    coalesce(p_metadata, '{}'::jsonb) - 'signature' - 'passphrase' - 'password' - 'token' - 'secret'
  );
exception when others then
  null;
end;
$$;

create or replace function public.fire_s_inspection_is_finalised(p_data jsonb)
returns boolean
language sql
immutable
as $$
  select
    p_data is not null
    and (
      nullif(trim(coalesce(p_data->>'completedAt', '')), '') is not null
      or nullif(trim(coalesce(p_data->>'finalisedAt', '')), '') is not null
      or nullif(trim(coalesce(p_data->>'finalizedAt', '')), '') is not null
      or lower(trim(coalesce(p_data->>'status', ''))) in ('completed', 'finalised', 'finalized')
      or lower(trim(coalesce(p_data->>'inspectionStatus', ''))) in ('completed', 'finalised', 'finalized')
      or lower(trim(coalesce(p_data->>'archiveStatus', ''))) in ('completed', 'finalised', 'finalized')
    );
$$;

create or replace function public.fire_s_count_finalised_inspections(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.fire_s_trial_finalised_inspections c
  where c.company_id = p_company_id;
$$;

create or replace function public.fire_s_entitlement_limit()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select trial_inspection_limit
  from public.fire_s_entitlement_config
  where id = 1;
$$;

create or replace function public.fire_s_entitlement_trial_days()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select trial_days
  from public.fire_s_entitlement_config
  where id = 1;
$$;

-- Compute live status from trusted server time. Never uses client clocks.
create or replace function public.fire_s_compute_entitlement(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.companies%rowtype;
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
  v_can_draft boolean := true;
  v_paid boolean := false;
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
      'plan', null,
      'can_finalise', false,
      'can_create', false,
      'can_write_draft', false,
      'server_now', v_now
    );
  end if;

  select * into v_row from public.companies c where c.id = p_company_id;
  if not found then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'subscription_required',
      'status', 'subscription_required',
      'trial_days_remaining', 0,
      'trial_inspections_remaining', 0,
      'trial_inspections_used', 0,
      'trial_inspection_limit', v_limit,
      'plan', null,
      'can_finalise', false,
      'can_create', false,
      'can_write_draft', false,
      'server_now', v_now
    );
  end if;

  v_used := public.fire_s_count_finalised_inspections(p_company_id);
  v_limit := coalesce(v_row.trial_inspection_limit, v_limit, 3);
  v_remaining_insp := greatest(v_limit - v_used, 0);

  if v_row.trial_expires_at is not null then
    v_days := greatest(ceil(extract(epoch from (v_row.trial_expires_at - v_now)) / 86400.0)::int, 0);
  end if;

  v_paid := (
    coalesce(v_row.subscription_status, '') in ('active', 'subscription_active')
    and (
      v_row.subscription_paid_through is null
      or v_row.subscription_paid_through >= v_now
      or v_row.subscription_expires_at is null
      or v_row.subscription_expires_at >= v_now
    )
    and coalesce(v_row.subscription_status, '') not in ('cancelled', 'suspended', 'past_due')
  );

  if coalesce(v_row.subscription_status, '') = 'past_due' then
    v_status := 'subscription_past_due';
    v_reason := 'subscription_required';
  elsif coalesce(v_row.subscription_status, '') = 'suspended' then
    v_status := 'subscription_suspended';
    v_reason := 'subscription_required';
  elsif coalesce(v_row.subscription_status, '') = 'cancelled'
        and not v_paid then
    v_status := 'subscription_cancelled';
    v_reason := 'subscription_required';
  elsif v_paid or coalesce(v_row.entitlement_status, '') = 'subscription_active' then
    v_status := 'subscription_active';
    v_reason := null;
    v_allowed := true;
    v_can_finalise := true;
    v_can_create := true;
  elsif v_row.trial_started_at is not null then
    if v_now >= coalesce(v_row.trial_expires_at, v_row.trial_started_at) then
      v_status := 'trial_expired';
      v_reason := 'trial_expired';
      v_days := 0;
    elsif v_used >= v_limit then
      -- Time remains, but the included inspections are used.
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
    v_can_create := true; -- drafts allowed; finalise blocked
    v_can_draft := true;
  elsif v_reason in ('trial_expired', 'subscription_required') then
    v_allowed := false;
    v_can_finalise := false;
    v_can_create := false;
    v_can_draft := true;
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
    'trial_expires_at', v_row.trial_expires_at,
    'plan', coalesce(v_row.subscription_plan_id, v_row.plan, 'standard'),
    'subscription_status', v_row.subscription_status,
    'subscription_paid_through', v_row.subscription_paid_through,
    'can_finalise', v_can_finalise,
    'can_create', v_can_create,
    'can_write_draft', v_can_draft,
    'server_now', v_now,
    'company_id', p_company_id
  );
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

create or replace function public.fire_s_start_company_trial(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days int := public.fire_s_entitlement_trial_days();
  v_limit int := public.fire_s_entitlement_limit();
  v_started timestamptz;
  v_expires timestamptz;
begin
  if p_company_id is null then
    raise exception 'Company required';
  end if;

  perform set_config('fire_s.entitlement_write', 'on', true);

  -- Never restart a used trial. Status persists on the company record.
  select c.trial_started_at into v_started
  from public.companies c
  where c.id = p_company_id
  for update;

  if v_started is not null then
    return public.fire_s_refresh_entitlement_status(p_company_id);
  end if;

  v_started := now();
  v_expires := v_started + make_interval(days => v_days);

  update public.companies c
     set trial_started_at = v_started,
         trial_expires_at = v_expires,
         trial_inspection_limit = v_limit,
         trial_inspections_used = 0,
         entitlement_status = 'trial_active',
         subscription_status = coalesce(nullif(c.subscription_status, ''), 'trialing'),
         entitlement_updated_at = now(),
         updated_at = now()
   where c.id = p_company_id
     and c.trial_started_at is null;

  perform public.fire_s_audit_entitlement(
    p_company_id,
    'TRIAL_STARTED',
    jsonb_build_object(
      'trial_started_at', v_started,
      'trial_expires_at', v_expires,
      'trial_inspection_limit', v_limit
    )
  );

  return public.fire_s_refresh_entitlement_status(p_company_id);
end;
$$;

-- ONE central authoritative check. Callers must not trust browser values.
create or replace function public.fire_s_check_company_entitlement(p_company_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := p_company_id;
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
    return public.fire_s_compute_entitlement(null);
  end if;

  if not public.fire_s_is_super_admin()
     and not public.fire_s_is_company_member(v_company) then
    raise exception 'Not allowed to read another company entitlement';
  end if;

  return public.fire_s_refresh_entitlement_status(v_company);
end;
$$;

-- PayFast-ready activation. NOT granted to authenticated/anon.
create or replace function public.fire_s_activate_paid_subscription(
  p_company_id uuid,
  p_plan_id text,
  p_payment_reference text,
  p_billing_period text default 'monthly'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text := lower(nullif(trim(p_plan_id), ''));
  v_period text := lower(nullif(trim(p_billing_period), ''));
  v_ref text := nullif(trim(p_payment_reference), '');
  v_through timestamptz;
  v_info jsonb;
begin
  if p_company_id is null then
    raise exception 'Company required';
  end if;
  if v_ref is null then
    raise exception 'Verified payment reference required';
  end if;
  if exists (
    select 1 from public.companies c
    where c.payment_reference = v_ref
      and c.id <> p_company_id
  ) then
    raise exception 'Payment reference already used';
  end if;

  if v_plan is null or v_plan not in ('standard', 'seat', 'field', 'operations', 'executive', 'enterprise') then
    v_plan := 'standard';
  end if;
  if v_period is null or v_period not in ('monthly', 'annual') then
    v_period := 'monthly';
  end if;

  v_through := case
    when v_period = 'annual' then now() + interval '1 year'
    else now() + interval '1 month'
  end;

  perform set_config('fire_s.entitlement_write', 'on', true);

  update public.companies c
     set subscription_status = 'active',
         entitlement_status = 'subscription_active',
         subscription_plan_id = v_plan,
         plan = v_plan,
         billing_interval = v_period,
         billing_status = 'active',
         subscription_started_at = coalesce(c.subscription_started_at, now()),
         subscription_expires_at = v_through,
         subscription_paid_through = v_through,
         payment_reference = v_ref,
         payment_verified_at = now(),
         entitlement_updated_at = now(),
         updated_at = now()
   where c.id = p_company_id;

  perform public.fire_s_audit_entitlement(
    p_company_id,
    'SUBSCRIPTION_ACTIVATED',
    jsonb_build_object(
      'plan_id', v_plan,
      'billing_period', v_period,
      'payment_reference', v_ref,
      'paid_through', v_through
    )
  );

  v_info := public.fire_s_refresh_entitlement_status(p_company_id);
  return v_info;
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

  -- Do not reset trial_started_at / trial_expires_at.
  update public.companies c
     set subscription_status = 'cancelled',
         billing_status = 'cancelled',
         entitlement_status = case
           when c.trial_started_at is not null and now() < c.trial_expires_at
             and public.fire_s_count_finalised_inspections(c.id) < coalesce(c.trial_inspection_limit, public.fire_s_entitlement_limit())
           then 'trial_active'
           else 'subscription_cancelled'
         end,
         entitlement_updated_at = now(),
         updated_at = now()
   where c.id = v_company;

  perform public.fire_s_audit_entitlement(
    v_company,
    'SUBSCRIPTION_CANCELLED',
    jsonb_build_object('keep_data', true)
  );

  return public.fire_s_refresh_entitlement_status(v_company);
end;
$$;

create or replace function public.fire_s_admin_extend_trial(
  p_company_id uuid,
  p_extra_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days int := greatest(coalesce(p_extra_days, 0), 0);
  v_expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fire_s_is_super_admin() then
    raise exception 'Only Super Admin can extend a trial';
  end if;
  if p_company_id is null then
    raise exception 'Company required';
  end if;
  if v_days = 0 then
    raise exception 'Extra days must be greater than zero';
  end if;

  perform set_config('fire_s.entitlement_write', 'on', true);

  update public.companies c
     set trial_started_at = coalesce(c.trial_started_at, now()),
         trial_expires_at = coalesce(c.trial_expires_at, now()) + make_interval(days => v_days),
         trial_inspection_limit = coalesce(c.trial_inspection_limit, public.fire_s_entitlement_limit()),
         entitlement_status = 'trial_active',
         entitlement_updated_at = now(),
         updated_at = now()
   where c.id = p_company_id
  returning trial_expires_at into v_expires;

  if v_expires is null then
    raise exception 'Company not found';
  end if;

  perform public.fire_s_audit_entitlement(
    p_company_id,
    'TRIAL_EXTENDED',
    jsonb_build_object('extra_days', v_days, 'trial_expires_at', v_expires)
  );

  return public.fire_s_refresh_entitlement_status(p_company_id);
end;
$$;

create or replace function public.fire_s_admin_list_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fire_s_is_super_admin() then
    raise exception 'Only Super Admin can list company entitlements';
  end if;

  return coalesce((
    select jsonb_agg(public.fire_s_compute_entitlement(c.id) || jsonb_build_object(
      'company_name', c.name,
      'created_at', c.created_at
    ) order by c.created_at desc)
    from public.companies c
  ), '[]'::jsonb);
end;
$$;

create or replace function public.fire_s_admin_trial_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_active int := 0;
  v_expired int := 0;
  v_converted int := 0;
  v_avg numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fire_s_is_super_admin() then
    raise exception 'Only Super Admin can view trial analytics';
  end if;

  select count(*)::int into v_total
  from public.companies c
  where c.trial_started_at is not null;

  select count(*)::int into v_active
  from public.companies c
  where c.trial_started_at is not null
    and now() < c.trial_expires_at
    and coalesce(c.subscription_status, '') not in ('active', 'subscription_active');

  select count(*)::int into v_expired
  from public.companies c
  where c.trial_started_at is not null
    and now() >= c.trial_expires_at
    and coalesce(c.subscription_status, '') not in ('active', 'subscription_active');

  select count(*)::int into v_converted
  from public.companies c
  where c.trial_started_at is not null
    and coalesce(c.subscription_status, '') in ('active', 'subscription_active');

  select coalesce(avg(public.fire_s_count_finalised_inspections(c.id)), 0) into v_avg
  from public.companies c
  where c.trial_started_at is not null;

  return jsonb_build_object(
    'total_trials', v_total,
    'active_trials', v_active,
    'expired_trials', v_expired,
    'converted_to_paid', v_converted,
    'conversion_rate', case when v_total = 0 then 0 else round((v_converted::numeric / v_total::numeric) * 1000) / 10 end,
    'average_inspections_during_trial', round(v_avg, 2)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Protect entitlement columns from client updates
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_protect_company_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.fire_s_entitlement_write_enabled() then
    return NEW;
  end if;

  if tg_op = 'INSERT' then
    NEW.trial_started_at := null;
    NEW.trial_expires_at := null;
    NEW.trial_inspection_limit := null;
    NEW.trial_inspections_used := 0;
    NEW.entitlement_status := null;
    NEW.subscription_status := null;
    NEW.subscription_plan_id := null;
    NEW.subscription_started_at := null;
    NEW.subscription_expires_at := null;
    NEW.subscription_paid_through := null;
    NEW.payment_reference := null;
    NEW.payment_verified_at := null;
    NEW.billing_status := coalesce(NEW.billing_status, 'unpaid');
    return NEW;
  end if;

  NEW.trial_started_at := OLD.trial_started_at;
  NEW.trial_expires_at := OLD.trial_expires_at;
  NEW.trial_inspection_limit := OLD.trial_inspection_limit;
  NEW.trial_inspections_used := OLD.trial_inspections_used;
  NEW.entitlement_status := OLD.entitlement_status;
  NEW.subscription_status := OLD.subscription_status;
  NEW.subscription_plan_id := OLD.subscription_plan_id;
  NEW.subscription_started_at := OLD.subscription_started_at;
  NEW.subscription_expires_at := OLD.subscription_expires_at;
  NEW.subscription_paid_through := OLD.subscription_paid_through;
  NEW.payment_reference := OLD.payment_reference;
  NEW.payment_verified_at := OLD.payment_verified_at;
  NEW.billing_status := OLD.billing_status;
  NEW.billing_renews_on := OLD.billing_renews_on;
  return NEW;
end;
$$;

drop trigger if exists fire_s_protect_company_entitlement on public.companies;
create trigger fire_s_protect_company_entitlement
  before insert or update on public.companies
  for each row
  execute procedure public.fire_s_protect_company_entitlement();

create or replace function public.fire_s_companies_after_insert_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- New company records start exactly one trial. Existing rows were
  -- grandfathered before this trigger was created.
  if NEW.trial_started_at is null
     and coalesce(NEW.entitlement_status, '') = '' then
    perform public.fire_s_start_company_trial(NEW.id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists fire_s_companies_after_insert_trial on public.companies;
create trigger fire_s_companies_after_insert_trial
  after insert on public.companies
  for each row
  execute procedure public.fire_s_companies_after_insert_trial();

-- ---------------------------------------------------------------------------
-- 6) Inspection finalise guard (RPC and direct table writes)
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_inspections_entitlement_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_info jsonb;
  v_was boolean := false;
  v_now boolean := false;
  v_id text;
  v_reason text;
begin
  if public.fire_s_is_super_admin() then
    return NEW;
  end if;

  v_company := coalesce(NEW.company_id, OLD.company_id);

  if v_company is null then
    select m.company_id into v_company
    from public.company_members m
    where m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
    limit 1;
    NEW.company_id := v_company;
  end if;

  if v_company is null then
    raise exception 'FIRE_S_ENTITLEMENT:subscription_required:Company required';
  end if;

  if NEW.company_id is not null
     and not public.fire_s_is_company_member(NEW.company_id)
     and not public.fire_s_is_super_admin() then
    raise exception 'FIRE_S_ENTITLEMENT:subscription_required:Not a member of this company';
  end if;

  if tg_op = 'UPDATE'
     and OLD.company_id is not null
     and NEW.company_id is distinct from OLD.company_id then
    NEW.company_id := OLD.company_id;
  end if;

  v_was := tg_op = 'UPDATE' and public.fire_s_inspection_is_finalised(OLD.inspection_data);
  v_now := public.fire_s_inspection_is_finalised(NEW.inspection_data);
  v_id := coalesce(NEW.id::text, OLD.id::text);

  perform pg_advisory_xact_lock(hashtext('fire_s_entitlement:' || v_company::text));

  v_info := public.fire_s_compute_entitlement(v_company);
  v_reason := v_info->>'reason';

  if tg_op = 'INSERT' and not v_now then
    if coalesce((v_info->>'can_create')::boolean, false) is not true then
      raise exception 'FIRE_S_ENTITLEMENT:%:%',
        coalesce(v_reason, 'subscription_required'),
        'A subscription is required to start new inspections';
    end if;
    return NEW;
  end if;

  if v_now and not v_was then
    if exists (
      select 1
      from public.fire_s_trial_finalised_inspections t
      where t.company_id = v_company
        and t.inspection_id = v_id
    ) then
      return NEW;
    end if;

    if coalesce((v_info->>'can_finalise')::boolean, false) is not true then
      raise exception 'FIRE_S_ENTITLEMENT:%:%',
        coalesce(v_reason, 'subscription_required'),
        case
          when v_reason = 'trial_limit_reached' then
            'You have completed the inspections included in your Fire-S free trial. Choose a subscription plan to continue using Fire-S.'
          when v_reason = 'trial_expired' then
            'Your Fire-S free trial has ended.'
          else
            'A Fire-S subscription is required to finalise inspections.'
        end;
    end if;

    insert into public.fire_s_trial_finalised_inspections (inspection_id, company_id)
    values (v_id, v_company)
    on conflict (company_id, inspection_id) do nothing;

    perform set_config('fire_s.entitlement_write', 'on', true);

    update public.companies c
       set trial_inspections_used = public.fire_s_count_finalised_inspections(v_company),
           entitlement_updated_at = now()
     where c.id = v_company;

    perform public.fire_s_audit_entitlement(
      v_company,
      'TRIAL_INSPECTION_COMPLETED',
      jsonb_build_object('inspection_id', v_id)
    );

    perform public.fire_s_refresh_entitlement_status(v_company);
  elsif not v_now and tg_op = 'UPDATE' then
    if coalesce((v_info->>'can_write_draft')::boolean, true) is not true
       and coalesce((v_info->>'allowed')::boolean, false) is not true then
      raise exception 'FIRE_S_ENTITLEMENT:%:%',
        coalesce(v_reason, 'subscription_required'),
        'A subscription is required to change inspections';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists fire_s_inspections_entitlement_guard on public.inspections;
create trigger fire_s_inspections_entitlement_guard
  before insert or update on public.inspections
  for each row
  execute procedure public.fire_s_inspections_entitlement_guard();

-- ---------------------------------------------------------------------------
-- 7) Restrict start-fresh (trial-reset vector) to Super Admin
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_start_fresh_company(p_name text)
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
  v_company_id uuid;
  v_name text := nullif(trim(p_name), '');
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not public.fire_s_is_super_admin() then
    raise exception 'Only Super Admin can start another company';
  end if;
  if v_name is null then
    v_name := 'New Fire-S Company';
  end if;

  update public.company_members
     set status = 'inactive'
   where user_id = v_uid
     and coalesce(status, 'active') = 'active';

  insert into public.companies (name, status, plan)
  values (v_name, 'active', 'standard')
  returning id into v_company_id;

  insert into public.company_members as cm (company_id, user_id, role, status)
  values (v_company_id, v_uid, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update set role = 'company_owner', status = 'active';

  begin
    update public.profiles
       set role = 'company_owner'
     where id = v_uid;
  exception when others then
    null;
  end;

  return query
    select c.id, c.name, 'company_owner'::text
    from public.companies c
    where c.id = v_company_id;
end;
$$;

grant execute on function public.fire_s_start_fresh_company(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Grandfather existing companies so current customers keep access.
--    NEW companies still receive a trial via the AFTER INSERT trigger.
-- ---------------------------------------------------------------------------
select set_config('fire_s.entitlement_write', 'on', true);

update public.companies c
   set entitlement_status = coalesce(nullif(c.entitlement_status, ''), 'subscription_active'),
       subscription_status = coalesce(nullif(c.subscription_status, ''), 'active'),
       subscription_plan_id = coalesce(c.subscription_plan_id, c.plan, 'standard'),
       subscription_started_at = coalesce(c.subscription_started_at, c.created_at, now()),
       billing_status = coalesce(nullif(c.billing_status, ''), 'active'),
       entitlement_updated_at = now()
 where c.trial_started_at is null
   and coalesce(c.entitlement_status, '') = '';

-- Backfill claims from already-finalised inspections (analytics / usage).
insert into public.fire_s_trial_finalised_inspections (inspection_id, company_id, finalised_at)
select i.id::text, i.company_id, coalesce(i.updated_at, now())
from public.inspections i
where i.company_id is not null
  and public.fire_s_inspection_is_finalised(i.inspection_data)
on conflict (company_id, inspection_id) do nothing;

update public.companies c
   set trial_inspections_used = public.fire_s_count_finalised_inspections(c.id);

-- ---------------------------------------------------------------------------
-- 9) RLS
-- ---------------------------------------------------------------------------
alter table public.fire_s_entitlement_config enable row level security;
alter table public.fire_s_trial_finalised_inspections enable row level security;
alter table public.fire_s_entitlement_audit enable row level security;

drop policy if exists "fire_s_entitlement_config_select" on public.fire_s_entitlement_config;
create policy "fire_s_entitlement_config_select"
  on public.fire_s_entitlement_config for select to authenticated
  using (true);

drop policy if exists "fire_s_entitlement_config_update" on public.fire_s_entitlement_config;
create policy "fire_s_entitlement_config_update"
  on public.fire_s_entitlement_config for update to authenticated
  using (public.fire_s_is_super_admin())
  with check (public.fire_s_is_super_admin());

drop policy if exists "fire_s_trial_claims_select" on public.fire_s_trial_finalised_inspections;
create policy "fire_s_trial_claims_select"
  on public.fire_s_trial_finalised_inspections for select to authenticated
  using (
    public.fire_s_is_company_member(company_id)
    or public.fire_s_is_super_admin()
  );

drop policy if exists "fire_s_entitlement_audit_select" on public.fire_s_entitlement_audit;
create policy "fire_s_entitlement_audit_select"
  on public.fire_s_entitlement_audit for select to authenticated
  using (
    public.fire_s_is_super_admin()
    or public.fire_s_is_company_member(company_id)
  );

-- Members may read their company (including trial dates for display).
-- They must not write protected columns; the BEFORE trigger strips those.
drop policy if exists "fire_s_companies_insert" on public.companies;
create policy "fire_s_companies_insert"
  on public.companies for insert to authenticated
  with check (false);

-- Tighten inspection write so company_id cannot be swapped to another tenant.
drop policy if exists "fire_s_inspections_insert" on public.inspections;
create policy "fire_s_inspections_insert"
  on public.inspections for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      company_id is null
      or public.fire_s_is_company_member(company_id)
    )
  );

drop policy if exists "fire_s_inspections_update" on public.inspections;
create policy "fire_s_inspections_update"
  on public.inspections for update to authenticated
  using (user_id = auth.uid() or public.fire_s_is_company_member(company_id))
  with check (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
  );

-- ---------------------------------------------------------------------------
-- 10) Grants — activatePaidSubscription is service_role only
-- ---------------------------------------------------------------------------
revoke all on function public.fire_s_check_company_entitlement(uuid) from public;
grant execute on function public.fire_s_check_company_entitlement(uuid) to authenticated;

revoke all on function public.fire_s_cancel_company_subscription() from public;
grant execute on function public.fire_s_cancel_company_subscription() to authenticated;

revoke all on function public.fire_s_admin_extend_trial(uuid, integer) from public;
grant execute on function public.fire_s_admin_extend_trial(uuid, integer) to authenticated;

revoke all on function public.fire_s_admin_list_entitlements() from public;
grant execute on function public.fire_s_admin_list_entitlements() to authenticated;

revoke all on function public.fire_s_admin_trial_analytics() from public;
grant execute on function public.fire_s_admin_trial_analytics() to authenticated;

revoke all on function public.fire_s_activate_paid_subscription(uuid, text, text, text) from public;
revoke all on function public.fire_s_activate_paid_subscription(uuid, text, text, text) from anon;
revoke all on function public.fire_s_activate_paid_subscription(uuid, text, text, text) from authenticated;
grant execute on function public.fire_s_activate_paid_subscription(uuid, text, text, text) to service_role;

revoke all on function public.fire_s_start_company_trial(uuid) from public;
revoke all on function public.fire_s_start_company_trial(uuid) from anon;
revoke all on function public.fire_s_start_company_trial(uuid) from authenticated;
grant execute on function public.fire_s_start_company_trial(uuid) to service_role;

revoke all on function public.fire_s_compute_entitlement(uuid) from public;
revoke all on function public.fire_s_compute_entitlement(uuid) from anon;
revoke all on function public.fire_s_compute_entitlement(uuid) from authenticated;

revoke all on function public.fire_s_refresh_entitlement_status(uuid) from public;
revoke all on function public.fire_s_refresh_entitlement_status(uuid) from anon;
revoke all on function public.fire_s_refresh_entitlement_status(uuid) from authenticated;

grant execute on function public.fire_s_is_super_admin() to authenticated;
grant execute on function public.fire_s_inspection_is_finalised(jsonb) to authenticated;
grant execute on function public.fire_s_entitlement_limit() to authenticated;
grant execute on function public.fire_s_entitlement_trial_days() to authenticated;

revoke all on table public.fire_s_entitlement_config from public;
grant select on table public.fire_s_entitlement_config to authenticated;

revoke insert, update, delete on table public.fire_s_trial_finalised_inspections from authenticated;
revoke insert, update, delete on table public.fire_s_trial_finalised_inspections from anon;
grant select on table public.fire_s_trial_finalised_inspections to authenticated;

revoke insert, update, delete on table public.fire_s_entitlement_audit from authenticated;
revoke insert, update, delete on table public.fire_s_entitlement_audit from anon;
grant select on table public.fire_s_entitlement_audit to authenticated;

commit;

select 'fire_s company entitlement ready' as status;
