-- Fire-S Phase 2: company subscription data model + payment event ledger
--
-- Run AFTER SUPABASE_company_entitlement.sql (needs fire_s_is_super_admin,
-- fire_s_is_company_member, fire_s_can_manage_company,
-- fire_s_entitlement_write_enabled, fire_s_audit_entitlement).
--
-- Additive. Does not drop companies, inspections, photos, or reports.
-- Does not change fire_s_compute_entitlement or the inspection trigger.
-- Existing RPCs (trial start, activate, cancel) keep writing companies.*;
-- a trigger copies that into fire_s_company_subscriptions so the new table
-- is the durable per-company subscription row going forward.
--
-- Authoritative billing status lives in Postgres, not localStorage / URLs.
-- Authenticated clients may SELECT their own company row. They cannot
-- INSERT/UPDATE/DELETE billing. Status changes require service_role +
-- fire_s.entitlement_write = on (same GUC as the existing entitlement RPCs).
--
-- Paste into Supabase SQL Editor on Fire-S Test first. Sit live later.

begin;

-- ---------------------------------------------------------------------------
-- 0) Sync GUC — stops companies <-> subscriptions trigger recursion
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_subscription_syncing()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('fire_s.subscription_sync', true), '') = 'on';
$$;

-- ---------------------------------------------------------------------------
-- 1) Map legacy company columns → internal subscription status
--    Frontend values are not used. Only these six statuses are stored.
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_map_internal_subscription_status(
  p_subscription_status text,
  p_entitlement_status text,
  p_trial_started_at timestamptz,
  p_trial_ends_at timestamptz,
  p_now timestamptz default now()
)
returns text
language plpgsql
stable
as $$
declare
  v_sub text := lower(trim(coalesce(p_subscription_status, '')));
  v_ent text := lower(trim(coalesce(p_entitlement_status, '')));
begin
  if v_sub in ('past_due') or v_ent in ('subscription_past_due', 'past_due') then
    return 'past_due';
  end if;
  if v_sub in ('cancelled', 'canceled')
     or v_ent in ('subscription_cancelled', 'cancelled', 'canceled') then
    return 'cancelled';
  end if;
  if v_sub in ('payment_pending') or v_ent in ('payment_pending') then
    return 'payment_pending';
  end if;
  if v_sub in ('active', 'subscription_active')
     or v_ent in ('subscription_active') then
    return 'active';
  end if;
  if v_sub in ('trialing')
     or v_ent in ('trial_active')
     or (
       p_trial_started_at is not null
       and p_trial_ends_at is not null
       and p_now < p_trial_ends_at
       and v_sub not in ('active', 'subscription_active', 'cancelled', 'past_due')
     ) then
    return 'trialing';
  end if;
  if v_sub in ('expired')
     or v_ent in ('trial_expired', 'subscription_required', 'expired') then
    return 'expired';
  end if;
  if p_trial_started_at is not null
     and (p_trial_ends_at is null or p_now >= p_trial_ends_at) then
    return 'expired';
  end if;
  return 'expired';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) fire_s_company_subscriptions
--    One row per company/tenant. Subscription does not belong to an inspector.
-- ---------------------------------------------------------------------------
create table if not exists public.fire_s_company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  provider text not null default 'none',
  plan_code text,
  billing_interval text,
  status text not null default 'expired',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  subscription_started_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  payfast_subscription_token text,
  payfast_payment_id text,
  last_payment_at timestamptz,
  next_billing_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fire_s_company_subscriptions_company_uidx unique (company_id),
  constraint fire_s_company_subscriptions_status_chk
    check (status in (
      'trialing',
      'active',
      'past_due',
      'cancelled',
      'expired',
      'payment_pending'
    )),
  constraint fire_s_company_subscriptions_interval_chk
    check (
      billing_interval is null
      or billing_interval in ('monthly', 'annual')
    ),
  constraint fire_s_company_subscriptions_provider_chk
    check (provider in ('none', 'payfast', 'manual', 'grandfather', 'invoice'))
);

comment on table public.fire_s_company_subscriptions is
  'Canonical Fire-S company/tenant subscription. One row per company. Not per inspector. Writes are service_role only.';

comment on column public.fire_s_company_subscriptions.company_id is
  'Tenant that owns this subscription. Every company member is gated by this row.';
comment on column public.fire_s_company_subscriptions.provider is
  'Billing provider: none (trial/unpaid), payfast, invoice, manual, grandfather.';
comment on column public.fire_s_company_subscriptions.plan_code is
  'Internal plan id (standard/seat/…). Not a PayFast field.';
comment on column public.fire_s_company_subscriptions.status is
  'Server-side status only. Clients cannot set this to active.';
comment on column public.fire_s_company_subscriptions.trial_ends_at is
  'Server clock. Maps from companies.trial_expires_at.';
comment on column public.fire_s_company_subscriptions.payfast_subscription_token is
  'PayFast recurring token. Empty until ITN (Phase 3+).';
comment on column public.fire_s_company_subscriptions.payfast_payment_id is
  'Last PayFast pf_payment_id or merchant payment_reference.';

create index if not exists fire_s_company_subscriptions_status_idx
  on public.fire_s_company_subscriptions (status);

create index if not exists fire_s_company_subscriptions_period_end_idx
  on public.fire_s_company_subscriptions (current_period_end);

create unique index if not exists fire_s_company_subscriptions_pf_token_uidx
  on public.fire_s_company_subscriptions (payfast_subscription_token)
  where payfast_subscription_token is not null
    and length(trim(payfast_subscription_token)) > 0;

create index if not exists fire_s_company_subscriptions_pf_payment_idx
  on public.fire_s_company_subscriptions (payfast_payment_id)
  where payfast_payment_id is not null
    and length(trim(payfast_payment_id)) > 0;

-- ---------------------------------------------------------------------------
-- 3) fire_s_payment_events — ITN / invoice ledger (no card data)
-- ---------------------------------------------------------------------------
create table if not exists public.fire_s_payment_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,
  subscription_id uuid references public.fire_s_company_subscriptions (id) on delete set null,
  provider text not null default 'payfast',
  payfast_payment_id text,
  m_payment_id text,
  payfast_token text,
  amount numeric(12, 2),
  currency text not null default 'ZAR',
  payment_status text,
  event_type text not null default 'itn',
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.fire_s_payment_events is
  'Append-mostly payment / ITN ledger. No card numbers, CVV, or passphrases. Duplicate PayFast notices share (provider, payfast_payment_id, payment_status).';

comment on column public.fire_s_payment_events.payfast_payment_id is
  'PayFast pf_payment_id when present.';
comment on column public.fire_s_payment_events.m_payment_id is
  'Merchant m_payment_id from checkout.';
comment on column public.fire_s_payment_events.payload is
  'Sanitised ITN/debug JSON. Secrets stripped on insert.';
comment on column public.fire_s_payment_events.processed_at is
  'When Fire-S applied this event to the company subscription. Null = received but not applied.';

create index if not exists fire_s_payment_events_company_idx
  on public.fire_s_payment_events (company_id, created_at desc);

create index if not exists fire_s_payment_events_subscription_idx
  on public.fire_s_payment_events (subscription_id, created_at desc);

create index if not exists fire_s_payment_events_m_payment_idx
  on public.fire_s_payment_events (m_payment_id);

create unique index if not exists fire_s_payment_events_duplicate_uidx
  on public.fire_s_payment_events (provider, payfast_payment_id, payment_status)
  where payfast_payment_id is not null
    and length(trim(payfast_payment_id)) > 0
    and payment_status is not null;

-- ---------------------------------------------------------------------------
-- 4) Strip secrets / card-shaped keys from payment payloads
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_sanitize_payment_payload(p_payload jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(p_payload, '{}'::jsonb)
    - 'signature'
    - 'passphrase'
    - 'password'
    - 'token'
    - 'secret'
    - 'merchant_key'
    - 'card_number'
    - 'cardNumber'
    - 'cc_number'
    - 'cvv'
    - 'cvc'
    - 'cc_cvv'
    - 'card_cvv'
    - 'expiry'
    - 'cc_expiry'
    - 'card_expiry';
$$;

-- ---------------------------------------------------------------------------
-- 5) Protect subscription rows — clients cannot promote themselves to active
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_protect_company_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if public.fire_s_entitlement_write_enabled() then
      return OLD;
    end if;
    raise exception 'FIRE_S_SUBSCRIPTION:forbidden:Subscription rows cannot be deleted from the browser';
  end if;

  NEW.updated_at := now();
  NEW.status := lower(trim(coalesce(NEW.status, 'expired')));
  if NEW.billing_interval is not null then
    NEW.billing_interval := lower(trim(NEW.billing_interval));
  end if;
  if NEW.provider is not null then
    NEW.provider := lower(trim(NEW.provider));
  end if;

  if public.fire_s_entitlement_write_enabled() then
    return NEW;
  end if;

  -- Untrusted path (PostgREST as authenticated, even if a policy is added later).
  if tg_op = 'INSERT' then
    raise exception 'FIRE_S_SUBSCRIPTION:forbidden:Only the billing service can create a subscription row';
  end if;

  NEW.provider := OLD.provider;
  NEW.plan_code := OLD.plan_code;
  NEW.billing_interval := OLD.billing_interval;
  NEW.status := OLD.status;
  NEW.trial_started_at := OLD.trial_started_at;
  NEW.trial_ends_at := OLD.trial_ends_at;
  NEW.subscription_started_at := OLD.subscription_started_at;
  NEW.current_period_start := OLD.current_period_start;
  NEW.current_period_end := OLD.current_period_end;
  NEW.cancelled_at := OLD.cancelled_at;
  NEW.payfast_subscription_token := OLD.payfast_subscription_token;
  NEW.payfast_payment_id := OLD.payfast_payment_id;
  NEW.last_payment_at := OLD.last_payment_at;
  NEW.next_billing_at := OLD.next_billing_at;
  NEW.company_id := OLD.company_id;
  NEW.created_at := OLD.created_at;
  return NEW;
end;
$$;

drop trigger if exists fire_s_protect_company_subscription on public.fire_s_company_subscriptions;
create trigger fire_s_protect_company_subscription
  before insert or update or delete on public.fire_s_company_subscriptions
  for each row
  execute procedure public.fire_s_protect_company_subscription();

create or replace function public.fire_s_protect_payment_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if public.fire_s_entitlement_write_enabled() then
      return OLD;
    end if;
    raise exception 'FIRE_S_SUBSCRIPTION:forbidden:Payment events cannot be deleted from the browser';
  end if;

  if tg_op = 'INSERT' then
    NEW.payload := public.fire_s_sanitize_payment_payload(NEW.payload);
    if not public.fire_s_entitlement_write_enabled() then
      raise exception 'FIRE_S_SUBSCRIPTION:forbidden:Only the billing service can record a payment';
    end if;
    return NEW;
  end if;

  -- Ledger is immutable except processed_at (and only when still null).
  if not public.fire_s_entitlement_write_enabled() then
    raise exception 'FIRE_S_SUBSCRIPTION:forbidden:Payment events cannot be changed from the browser';
  end if;

  NEW.company_id := OLD.company_id;
  NEW.subscription_id := OLD.subscription_id;
  NEW.provider := OLD.provider;
  NEW.payfast_payment_id := OLD.payfast_payment_id;
  NEW.m_payment_id := OLD.m_payment_id;
  NEW.payfast_token := OLD.payfast_token;
  NEW.amount := OLD.amount;
  NEW.currency := OLD.currency;
  NEW.payment_status := OLD.payment_status;
  NEW.event_type := OLD.event_type;
  NEW.payload := OLD.payload;
  NEW.occurred_at := OLD.occurred_at;
  NEW.created_at := OLD.created_at;
  if OLD.processed_at is not null then
    NEW.processed_at := OLD.processed_at;
  end if;
  return NEW;
end;
$$;

drop trigger if exists fire_s_protect_payment_event on public.fire_s_payment_events;
create trigger fire_s_protect_payment_event
  before insert or update or delete on public.fire_s_payment_events
  for each row
  execute procedure public.fire_s_protect_payment_event();

-- ---------------------------------------------------------------------------
-- 6) Keep the new table in sync with existing company entitlement writes
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_sync_subscription_from_company(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.companies%rowtype;
  v_status text;
  v_provider text;
  v_interval text;
  v_plan text;
  v_id uuid;
  v_period_end timestamptz;
  v_next timestamptz;
begin
  if p_company_id is null then
    return null;
  end if;
  if public.fire_s_subscription_syncing() then
    select s.id into v_id
    from public.fire_s_company_subscriptions s
    where s.company_id = p_company_id;
    return v_id;
  end if;

  select * into v_row from public.companies c where c.id = p_company_id;
  if not found then
    return null;
  end if;

  perform set_config('fire_s.entitlement_write', 'on', true);
  perform set_config('fire_s.subscription_sync', 'on', true);

  v_status := public.fire_s_map_internal_subscription_status(
    v_row.subscription_status,
    v_row.entitlement_status,
    v_row.trial_started_at,
    v_row.trial_expires_at,
    now()
  );

  v_interval := lower(trim(coalesce(v_row.billing_interval, '')));
  if v_interval not in ('monthly', 'annual') then
    v_interval := null;
  end if;

  v_plan := nullif(trim(coalesce(v_row.subscription_plan_id, v_row.plan, '')), '');

  v_period_end := coalesce(v_row.subscription_paid_through, v_row.subscription_expires_at);
  if v_row.billing_renews_on is not null then
    v_next := v_row.billing_renews_on::timestamptz;
  else
    v_next := v_period_end;
  end if;

  insert into public.fire_s_company_subscriptions as s (
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
    payfast_payment_id,
    last_payment_at,
    next_billing_at
  )
  values (
    p_company_id,
    case
      when nullif(trim(coalesce(v_row.payment_reference, '')), '') is not null then 'payfast'
      when v_status = 'active' and v_row.payment_verified_at is null then 'grandfather'
      when coalesce(v_row.billing_status, '') in ('active', 'paid')
           and v_status = 'active' then 'invoice'
      else 'none'
    end,
    v_plan,
    v_interval,
    v_status,
    v_row.trial_started_at,
    v_row.trial_expires_at,
    v_row.subscription_started_at,
    v_row.subscription_started_at,
    v_period_end,
    case when v_status = 'cancelled' then coalesce(v_row.entitlement_updated_at, now()) else null end,
    nullif(trim(coalesce(v_row.payment_reference, '')), ''),
    v_row.payment_verified_at,
    v_next
  )
  on conflict (company_id) do update
    set plan_code = excluded.plan_code,
        billing_interval = coalesce(excluded.billing_interval, s.billing_interval),
        status = excluded.status,
        trial_started_at = coalesce(excluded.trial_started_at, s.trial_started_at),
        trial_ends_at = coalesce(excluded.trial_ends_at, s.trial_ends_at),
        subscription_started_at = coalesce(excluded.subscription_started_at, s.subscription_started_at),
        current_period_start = coalesce(excluded.current_period_start, s.current_period_start),
        current_period_end = coalesce(excluded.current_period_end, s.current_period_end),
        cancelled_at = case
          when excluded.status = 'cancelled'
            then coalesce(s.cancelled_at, excluded.cancelled_at, now())
          else s.cancelled_at
        end,
        payfast_payment_id = coalesce(excluded.payfast_payment_id, s.payfast_payment_id),
        last_payment_at = coalesce(excluded.last_payment_at, s.last_payment_at),
        next_billing_at = coalesce(excluded.next_billing_at, s.next_billing_at),
        provider = case
          when s.provider = 'payfast' then 'payfast'
          else excluded.provider
        end,
        updated_at = now()
  returning s.id into v_id;

  return v_id;
end;
$$;

create or replace function public.fire_s_companies_after_sync_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and NEW.trial_started_at is not distinct from OLD.trial_started_at
     and NEW.trial_expires_at is not distinct from OLD.trial_expires_at
     and NEW.entitlement_status is not distinct from OLD.entitlement_status
     and NEW.subscription_status is not distinct from OLD.subscription_status
     and NEW.subscription_plan_id is not distinct from OLD.subscription_plan_id
     and NEW.subscription_started_at is not distinct from OLD.subscription_started_at
     and NEW.subscription_expires_at is not distinct from OLD.subscription_expires_at
     and NEW.subscription_paid_through is not distinct from OLD.subscription_paid_through
     and NEW.payment_reference is not distinct from OLD.payment_reference
     and NEW.payment_verified_at is not distinct from OLD.payment_verified_at
     and NEW.billing_status is not distinct from OLD.billing_status
     and NEW.billing_renews_on is not distinct from OLD.billing_renews_on
     and NEW.billing_interval is not distinct from OLD.billing_interval
     and NEW.plan is not distinct from OLD.plan then
    return NEW;
  end if;
  perform public.fire_s_sync_subscription_from_company(NEW.id);
  return NEW;
end;
$$;

drop trigger if exists fire_s_companies_after_sync_subscription on public.companies;
create trigger fire_s_companies_after_sync_subscription
  after insert or update on public.companies
  for each row
  execute procedure public.fire_s_companies_after_sync_subscription();

-- Future ITN writes this table first, then mirrors onto companies so
-- fire_s_compute_entitlement (unchanged) still sees paid_through / status.
create or replace function public.fire_s_sync_company_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ent text;
  v_sub text;
begin
  if public.fire_s_subscription_syncing() then
    return NEW;
  end if;
  if not public.fire_s_entitlement_write_enabled() then
    return NEW;
  end if;

  perform set_config('fire_s.subscription_sync', 'on', true);
  perform set_config('fire_s.entitlement_write', 'on', true);

  case NEW.status
    when 'trialing' then
      v_sub := 'trialing';
      v_ent := 'trial_active';
    when 'active' then
      v_sub := 'active';
      v_ent := 'subscription_active';
    when 'past_due' then
      v_sub := 'past_due';
      v_ent := 'subscription_past_due';
    when 'cancelled' then
      v_sub := 'cancelled';
      v_ent := 'subscription_cancelled';
    when 'payment_pending' then
      v_sub := coalesce(nullif((select c.subscription_status from public.companies c where c.id = NEW.company_id), ''), 'payment_pending');
      v_ent := coalesce(nullif((select c.entitlement_status from public.companies c where c.id = NEW.company_id), ''), 'subscription_required');
    else
      v_sub := 'expired';
      v_ent := case
        when NEW.trial_started_at is not null then 'trial_expired'
        else 'subscription_required'
      end;
  end case;

  update public.companies c
     set trial_started_at = coalesce(NEW.trial_started_at, c.trial_started_at),
         trial_expires_at = coalesce(NEW.trial_ends_at, c.trial_expires_at),
         subscription_status = v_sub,
         entitlement_status = v_ent,
         subscription_plan_id = coalesce(NEW.plan_code, c.subscription_plan_id),
         plan = coalesce(NEW.plan_code, c.plan),
         billing_interval = coalesce(NEW.billing_interval, c.billing_interval),
         subscription_started_at = coalesce(NEW.subscription_started_at, c.subscription_started_at),
         subscription_expires_at = coalesce(NEW.current_period_end, c.subscription_expires_at),
         subscription_paid_through = coalesce(NEW.current_period_end, c.subscription_paid_through),
         payment_reference = coalesce(NEW.payfast_payment_id, c.payment_reference),
         payment_verified_at = coalesce(NEW.last_payment_at, c.payment_verified_at),
         billing_status = case
           when NEW.status = 'active' then 'active'
           when NEW.status = 'cancelled' then 'cancelled'
           when NEW.status = 'past_due' then 'past_due'
           when NEW.status = 'trialing' then coalesce(nullif(c.billing_status, ''), 'unpaid')
           else coalesce(c.billing_status, 'unpaid')
         end,
         billing_renews_on = coalesce(NEW.next_billing_at::date, c.billing_renews_on),
         entitlement_updated_at = now(),
         updated_at = now()
   where c.id = NEW.company_id;

  return NEW;
end;
$$;

drop trigger if exists fire_s_subscription_after_sync_company on public.fire_s_company_subscriptions;
create trigger fire_s_subscription_after_sync_company
  after insert or update on public.fire_s_company_subscriptions
  for each row
  execute procedure public.fire_s_sync_company_from_subscription();

-- ---------------------------------------------------------------------------
-- 7) service_role helpers (ITN / checkout will call these later)
-- ---------------------------------------------------------------------------
create or replace function public.fire_s_record_payment_event(
  p_company_id uuid,
  p_payfast_payment_id text,
  p_m_payment_id text,
  p_amount numeric,
  p_payment_status text,
  p_event_type text default 'itn',
  p_payload jsonb default '{}'::jsonb,
  p_payfast_token text default null,
  p_provider text default 'payfast',
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_sub uuid;
  v_status text := nullif(trim(p_payment_status), '');
  v_pf text := nullif(trim(p_payfast_payment_id), '');
  v_provider text := lower(nullif(trim(p_provider), ''));
begin
  if v_provider is null or v_provider not in ('none', 'payfast', 'manual', 'grandfather', 'invoice') then
    v_provider := 'payfast';
  end if;

  perform set_config('fire_s.entitlement_write', 'on', true);

  select s.id into v_sub
  from public.fire_s_company_subscriptions s
  where s.company_id = p_company_id;

  if v_pf is not null and v_status is not null then
    select e.id into v_id
    from public.fire_s_payment_events e
    where e.provider = v_provider
      and e.payfast_payment_id = v_pf
      and e.payment_status = v_status
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.fire_s_payment_events (
    company_id,
    subscription_id,
    provider,
    payfast_payment_id,
    m_payment_id,
    payfast_token,
    amount,
    currency,
    payment_status,
    event_type,
    payload,
    occurred_at
  )
  values (
    p_company_id,
    v_sub,
    v_provider,
    v_pf,
    nullif(trim(p_m_payment_id), ''),
    nullif(trim(p_payfast_token), ''),
    p_amount,
    'ZAR',
    v_status,
    coalesce(nullif(trim(p_event_type), ''), 'itn'),
    public.fire_s_sanitize_payment_payload(p_payload),
    coalesce(p_occurred_at, now())
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.fire_s_mark_payment_event_processed(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('fire_s.entitlement_write', 'on', true);
  update public.fire_s_payment_events
     set processed_at = coalesce(processed_at, now())
   where id = p_event_id;
end;
$$;

-- Read helper for the signed-in user's company. Does not trust browser status.
create or replace function public.fire_s_get_company_subscription(p_company_id uuid default null)
returns public.fire_s_company_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := p_company_id;
  v_row public.fire_s_company_subscriptions;
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
    return null;
  end if;

  if not public.fire_s_is_super_admin()
     and not public.fire_s_is_company_member(v_company) then
    raise exception 'Not allowed to read another company subscription';
  end if;

  select * into v_row
  from public.fire_s_company_subscriptions s
  where s.company_id = v_company;

  if not found then
    perform public.fire_s_sync_subscription_from_company(v_company);
    select * into v_row
    from public.fire_s_company_subscriptions s
    where s.company_id = v_company;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Backfill existing companies (preserve current access)
-- ---------------------------------------------------------------------------
select set_config('fire_s.entitlement_write', 'on', true);
select set_config('fire_s.subscription_sync', 'on', true);

insert into public.fire_s_company_subscriptions (
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
  payfast_payment_id,
  last_payment_at,
  next_billing_at
)
select
  c.id,
  case
    when nullif(trim(coalesce(c.payment_reference, '')), '') is not null then 'payfast'
    when coalesce(c.subscription_status, c.entitlement_status, '') in ('active', 'subscription_active')
         and c.payment_verified_at is null then 'grandfather'
    when coalesce(c.billing_status, '') in ('active', 'paid') then 'invoice'
    else 'none'
  end,
  nullif(trim(coalesce(c.subscription_plan_id, c.plan, '')), ''),
  case
    when lower(trim(coalesce(c.billing_interval, ''))) in ('monthly', 'annual')
      then lower(trim(c.billing_interval))
    else null
  end,
  public.fire_s_map_internal_subscription_status(
    c.subscription_status,
    c.entitlement_status,
    c.trial_started_at,
    c.trial_expires_at,
    now()
  ),
  c.trial_started_at,
  c.trial_expires_at,
  c.subscription_started_at,
  c.subscription_started_at,
  coalesce(c.subscription_paid_through, c.subscription_expires_at),
  case
    when coalesce(c.subscription_status, c.entitlement_status, '') in (
      'cancelled', 'canceled', 'subscription_cancelled'
    ) then coalesce(c.entitlement_updated_at, c.updated_at, now())
    else null
  end,
  nullif(trim(coalesce(c.payment_reference, '')), ''),
  c.payment_verified_at,
  coalesce(c.billing_renews_on::timestamptz, c.subscription_paid_through, c.subscription_expires_at)
from public.companies c
on conflict (company_id) do nothing;

-- ---------------------------------------------------------------------------
-- 9) RLS
--    Members: SELECT own company subscription.
--    Managers/owners: SELECT own company payment events (inspectors cannot).
--    Nobody authenticated: INSERT/UPDATE/DELETE.
--    super_admin: SELECT all (admin dashboards). Cannot write status to active
--    except via existing admin RPCs that set fire_s.entitlement_write.
-- ---------------------------------------------------------------------------
alter table public.fire_s_company_subscriptions enable row level security;
alter table public.fire_s_payment_events enable row level security;
-- Do not FORCE RLS: SECURITY DEFINER sync/backfill runs as the table owner.
-- FORCE would block those writes the same way it trapped inspection RPCs.

drop policy if exists "fire_s_company_subscriptions_select" on public.fire_s_company_subscriptions;
create policy "fire_s_company_subscriptions_select"
  on public.fire_s_company_subscriptions for select to authenticated
  using (
    public.fire_s_is_company_member(company_id)
    or public.fire_s_is_super_admin()
  );

drop policy if exists "fire_s_company_subscriptions_insert" on public.fire_s_company_subscriptions;
create policy "fire_s_company_subscriptions_insert"
  on public.fire_s_company_subscriptions for insert to authenticated
  with check (false);

drop policy if exists "fire_s_company_subscriptions_update" on public.fire_s_company_subscriptions;
create policy "fire_s_company_subscriptions_update"
  on public.fire_s_company_subscriptions for update to authenticated
  using (false)
  with check (false);

drop policy if exists "fire_s_company_subscriptions_delete" on public.fire_s_company_subscriptions;
create policy "fire_s_company_subscriptions_delete"
  on public.fire_s_company_subscriptions for delete to authenticated
  using (false);

drop policy if exists "fire_s_payment_events_select" on public.fire_s_payment_events;
create policy "fire_s_payment_events_select"
  on public.fire_s_payment_events for select to authenticated
  using (
    public.fire_s_is_super_admin()
    or (
      company_id is not null
      and public.fire_s_can_manage_company(company_id)
    )
  );

drop policy if exists "fire_s_payment_events_insert" on public.fire_s_payment_events;
create policy "fire_s_payment_events_insert"
  on public.fire_s_payment_events for insert to authenticated
  with check (false);

drop policy if exists "fire_s_payment_events_update" on public.fire_s_payment_events;
create policy "fire_s_payment_events_update"
  on public.fire_s_payment_events for update to authenticated
  using (false)
  with check (false);

drop policy if exists "fire_s_payment_events_delete" on public.fire_s_payment_events;
create policy "fire_s_payment_events_delete"
  on public.fire_s_payment_events for delete to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- 10) Grants
-- ---------------------------------------------------------------------------
revoke all on table public.fire_s_company_subscriptions from public;
revoke all on table public.fire_s_company_subscriptions from anon;
revoke insert, update, delete on table public.fire_s_company_subscriptions from authenticated;
grant select on table public.fire_s_company_subscriptions to authenticated;
grant all on table public.fire_s_company_subscriptions to service_role;

revoke all on table public.fire_s_payment_events from public;
revoke all on table public.fire_s_payment_events from anon;
revoke insert, update, delete on table public.fire_s_payment_events from authenticated;
grant select on table public.fire_s_payment_events to authenticated;
grant all on table public.fire_s_payment_events to service_role;

revoke all on function public.fire_s_sync_subscription_from_company(uuid) from public;
revoke all on function public.fire_s_sync_subscription_from_company(uuid) from anon;
revoke all on function public.fire_s_sync_subscription_from_company(uuid) from authenticated;
grant execute on function public.fire_s_sync_subscription_from_company(uuid) to service_role;

revoke all on function public.fire_s_record_payment_event(uuid, text, text, numeric, text, text, jsonb, text, text, timestamptz) from public;
revoke all on function public.fire_s_record_payment_event(uuid, text, text, numeric, text, text, jsonb, text, text, timestamptz) from anon;
revoke all on function public.fire_s_record_payment_event(uuid, text, text, numeric, text, text, jsonb, text, text, timestamptz) from authenticated;
grant execute on function public.fire_s_record_payment_event(uuid, text, text, numeric, text, text, jsonb, text, text, timestamptz) to service_role;

revoke all on function public.fire_s_mark_payment_event_processed(uuid) from public;
revoke all on function public.fire_s_mark_payment_event_processed(uuid) from anon;
revoke all on function public.fire_s_mark_payment_event_processed(uuid) from authenticated;
grant execute on function public.fire_s_mark_payment_event_processed(uuid) to service_role;

revoke all on function public.fire_s_get_company_subscription(uuid) from public;
grant execute on function public.fire_s_get_company_subscription(uuid) to authenticated;

grant execute on function public.fire_s_map_internal_subscription_status(text, text, timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function public.fire_s_sanitize_payment_payload(jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

select 'fire_s company subscriptions model ready' as status;
