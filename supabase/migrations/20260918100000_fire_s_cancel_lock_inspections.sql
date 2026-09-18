-- Fire-S: cancel locks inspection access immediately.
-- Run AFTER SUPABASE_subscription_lifecycle.sql on Fire-S Test.
--
-- Cancelled companies KEEP every inspection row in the cloud (keep_data).
-- App access continues until current_period_end. After that expiry date
-- the app and inspection SELECT cannot open old or new inspections until a
-- new subscription is active, or a valid trial remains.
-- Super Admin keeps access. Nothing is deleted. Sit live later.

begin;

update public.fire_s_entitlement_config
   set cancel_keeps_access_until_paid_through = false,
       updated_at = now()
 where id = 1;

alter table public.fire_s_entitlement_config
  alter column cancel_keeps_access_until_paid_through set default false;

comment on column public.fire_s_entitlement_config.cancel_keeps_access_until_paid_through is
  'Cancelled companies keep app access only until current_period_end. After that date can_read is false. Rows stay (keep_data).';

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
    return v_period;
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
  elsif v_sub_status = 'cancelled'
        and v_access is not null
        and v_now < v_access then
    v_status := 'subscription_cancelled';
    v_reason := 'cancelled_until_period_end';
    v_allowed := true;
    v_can_finalise := true;
    v_can_create := true;
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

create or replace function public.fire_s_get_company_entitlement(p_company_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := p_company_id;
  v_info jsonb;
  v_super boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_super := public.fire_s_is_super_admin();

  if v_company is null then
    select m.company_id into v_company
    from public.company_members m
    where m.user_id = v_uid
      and coalesce(m.status, 'active') = 'active'
    order by case m.role when 'company_owner' then 0 when 'owner' then 1 else 2 end
    limit 1;
  end if;

  if v_company is null then
    v_info := public.fire_s_compute_entitlement(null);
    return v_info || jsonb_build_object(
      'can_read', false,
      'can_export', false,
      'keep_data', true,
      'authority', 'server',
      'super_admin', v_super,
      'allowed', v_super,
      'can_create', v_super,
      'can_finalise', v_super,
      'can_write_draft', v_super
    );
  end if;

  if not v_super and not public.fire_s_is_company_member(v_company) then
    raise exception 'Not allowed to read another company entitlement';
  end if;

  v_info := public.fire_s_refresh_entitlement_status(v_company);
  v_info := v_info || jsonb_build_object(
    'keep_data', true,
    'authority', 'server',
    'super_admin', v_super
  );

  if v_super then
    v_info := v_info || jsonb_build_object(
      'allowed', true,
      'can_create', true,
      'can_finalise', true,
      'can_write_draft', true,
      'can_read', true,
      'can_export', true
    );
  end if;

  return v_info;
end;
$$;

create or replace function public.fire_s_company_can_read_inspections(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_info jsonb;
begin
  if public.fire_s_is_super_admin() then
    return true;
  end if;
  if p_company_id is null then
    return false;
  end if;
  v_info := public.fire_s_compute_entitlement(p_company_id);
  return coalesce((v_info->>'can_read')::boolean, false)
      or coalesce((v_info->>'allowed')::boolean, false);
end;
$$;

drop policy if exists fire_s_inspections_select on public.inspections;
create policy "fire_s_inspections_select"
  on public.inspections for select to authenticated
  using (
    public.fire_s_is_super_admin()
    or (
      (user_id = auth.uid() or public.fire_s_is_company_member(company_id))
      and public.fire_s_company_can_read_inspections(company_id)
    )
  );

create or replace function public.fire_s_inspections_entitlement_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_info jsonb;
begin
  if auth.uid() is null then
    return OLD;
  end if;
  if public.fire_s_is_super_admin() then
    return OLD;
  end if;
  v_company := coalesce(OLD.company_id, NEW.company_id);
  v_info := public.fire_s_compute_entitlement(v_company);
  if coalesce((v_info->>'can_read')::boolean, false) is not true
     and coalesce((v_info->>'allowed')::boolean, false) is not true then
    raise exception 'FIRE_S_ENTITLEMENT:%:%',
      coalesce(v_info->>'reason', 'subscription_required'),
      'Inspections stay in the cloud. A subscription is required to change them';
  end if;
  return OLD;
end;
$$;

drop trigger if exists fire_s_inspections_entitlement_delete_guard on public.inspections;
create trigger fire_s_inspections_entitlement_delete_guard
  before delete on public.inspections
  for each row
  execute procedure public.fire_s_inspections_entitlement_delete_guard();

revoke all on function public.fire_s_company_can_read_inspections(uuid) from public;
revoke all on function public.fire_s_company_can_read_inspections(uuid) from anon;
grant execute on function public.fire_s_company_can_read_inspections(uuid) to authenticated;
grant execute on function public.fire_s_company_can_read_inspections(uuid) to service_role;

comment on function public.fire_s_get_company_entitlement(uuid) is
  'Authoritative Fire-S company access. Browser localStorage/URL must not override this. Cancelled companies keep rows (keep_data) but can_read is false until a new subscription is active.';

commit;

notify pgrst, 'reload schema';

select 'fire_s cancel lock inspections ready' as status;
