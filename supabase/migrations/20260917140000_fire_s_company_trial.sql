-- Fire-S Phase 7: 14-day company trial + inspection limit
-- Run AFTER SUPABASE_entitlement_access.sql on Fire-S Test.
--
-- Trial belongs to the COMPANY. Dates come from now() only.
-- Browser clock / localStorage / extra logins cannot start or reset it.
-- Deleting inspections does not clear fire_s_trial_finalised_inspections.
-- Sit live later.

begin;

alter table public.companies add column if not exists trial_ends_at timestamptz;

update public.companies c
   set trial_ends_at = c.trial_expires_at
 where c.trial_ends_at is null
   and c.trial_expires_at is not null;

select set_config('fire_s.entitlement_write', 'on', true);

-- One founding user may start at most one company trial.
create table if not exists public.fire_s_trial_founders (
  user_id uuid primary key,
  company_id uuid not null references public.companies (id) on delete restrict,
  trial_started_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists fire_s_trial_founders_company_uidx
  on public.fire_s_trial_founders (company_id);

comment on table public.fire_s_trial_founders is
  'One Fire-S trial per founding user. Extra company logins and re-register must not insert another row.';

alter table public.fire_s_trial_founders enable row level security;

drop policy if exists "fire_s_trial_founders_select" on public.fire_s_trial_founders;
create policy "fire_s_trial_founders_select"
  on public.fire_s_trial_founders for select to authenticated
  using (user_id = auth.uid() or public.fire_s_is_super_admin());

drop policy if exists "fire_s_trial_founders_write" on public.fire_s_trial_founders;
create policy "fire_s_trial_founders_write"
  on public.fire_s_trial_founders for all to authenticated
  using (false)
  with check (false);

revoke insert, update, delete on table public.fire_s_trial_founders from authenticated;
revoke insert, update, delete on table public.fire_s_trial_founders from anon;
grant select on table public.fire_s_trial_founders to authenticated;

-- Inspection-limit claims stay even if the inspection row is deleted.
drop policy if exists "fire_s_trial_claims_insert" on public.fire_s_trial_finalised_inspections;
create policy "fire_s_trial_claims_insert"
  on public.fire_s_trial_finalised_inspections for insert to authenticated
  with check (false);

drop policy if exists "fire_s_trial_claims_update" on public.fire_s_trial_finalised_inspections;
create policy "fire_s_trial_claims_update"
  on public.fire_s_trial_finalised_inspections for update to authenticated
  using (false)
  with check (false);

drop policy if exists "fire_s_trial_claims_delete" on public.fire_s_trial_finalised_inspections;
create policy "fire_s_trial_claims_delete"
  on public.fire_s_trial_finalised_inspections for delete to authenticated
  using (false);

revoke insert, update, delete on table public.fire_s_trial_finalised_inspections from authenticated;
revoke insert, update, delete on table public.fire_s_trial_finalised_inspections from anon;

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
  v_ends timestamptz;
begin
  -- Validity uses Postgres now() only. Client Date / localStorage are ignored.
  if p_company_id is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'subscription_required',
      'status', 'subscription_required',
      'trial_days_remaining', 0,
      'trial_inspections_remaining', 0,
      'trial_inspections_used', 0,
      'trial_inspection_limit', v_limit,
      'trial_started_at', null,
      'trial_ends_at', null,
      'trial_expires_at', null,
      'plan', null,
      'can_finalise', false,
      'can_create', false,
      'can_write_draft', false,
      'server_now', v_now,
      'clock', 'server'
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
      'trial_started_at', null,
      'trial_ends_at', null,
      'trial_expires_at', null,
      'plan', null,
      'can_finalise', false,
      'can_create', false,
      'can_write_draft', false,
      'server_now', v_now,
      'clock', 'server'
    );
  end if;

  v_used := public.fire_s_count_finalised_inspections(p_company_id);
  v_limit := coalesce(v_row.trial_inspection_limit, v_limit, 3);
  v_remaining_insp := greatest(v_limit - v_used, 0);
  v_ends := coalesce(v_row.trial_ends_at, v_row.trial_expires_at);

  if v_ends is not null then
    v_days := greatest(ceil(extract(epoch from (v_ends - v_now)) / 86400.0)::int, 0);
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
    'trial_ends_at', v_ends,
    'trial_expires_at', v_ends,
    'plan', coalesce(v_row.subscription_plan_id, v_row.plan, 'standard'),
    'billing_interval', v_row.billing_interval,
    'subscription_status', v_row.subscription_status,
    'subscription_paid_through', v_row.subscription_paid_through,
    'subscription_expires_at', v_row.subscription_expires_at,
    'can_finalise', v_can_finalise,
    'can_create', v_can_create,
    'can_write_draft', v_can_draft,
    'keep_data', true,
    'can_read', true,
    'can_export', true,
    'server_now', v_now,
    'clock', 'server',
    'company_id', p_company_id
  );
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
  v_ends timestamptz;
  v_uid uuid := auth.uid();
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

  -- Extra users / a second company for the same founder do not get a new trial.
  if v_uid is not null
     and not public.fire_s_is_super_admin()
     and exists (
       select 1
       from public.fire_s_trial_founders f
       where f.user_id = v_uid
         and f.company_id is distinct from p_company_id
     ) then
    return public.fire_s_refresh_entitlement_status(p_company_id);
  end if;

  -- Server generated. No client timestamps accepted.
  v_started := now();
  v_ends := v_started + make_interval(days => coalesce(v_days, 14));

  update public.companies c
     set trial_started_at = v_started,
         trial_ends_at = v_ends,
         trial_expires_at = v_ends,
         trial_inspection_limit = v_limit,
         trial_inspections_used = 0,
         entitlement_status = 'trial_active',
         subscription_status = coalesce(nullif(c.subscription_status, ''), 'trialing'),
         entitlement_updated_at = now(),
         updated_at = now()
   where c.id = p_company_id
     and c.trial_started_at is null;

  if v_uid is not null then
    insert into public.fire_s_trial_founders (user_id, company_id, trial_started_at)
    values (v_uid, p_company_id, v_started)
    on conflict (user_id) do nothing;
  end if;

  perform public.fire_s_audit_entitlement(
    p_company_id,
    'TRIAL_STARTED',
    jsonb_build_object(
      'trial_started_at', v_started,
      'trial_ends_at', v_ends,
      'trial_expires_at', v_ends,
      'trial_inspection_limit', v_limit,
      'trial_days', coalesce(v_days, 14)
    )
  );

  return public.fire_s_refresh_entitlement_status(p_company_id);
end;
$$;

create or replace function public.fire_s_protect_company_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.fire_s_entitlement_write_enabled() then
    if NEW.trial_ends_at is null then
      NEW.trial_ends_at := NEW.trial_expires_at;
    elsif NEW.trial_expires_at is null then
      NEW.trial_expires_at := NEW.trial_ends_at;
    end if;
    return NEW;
  end if;

  if tg_op = 'INSERT' then
    NEW.trial_started_at := null;
    NEW.trial_ends_at := null;
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
  NEW.trial_ends_at := OLD.trial_ends_at;
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

drop function if exists public.fire_s_create_company(text);
drop function if exists public.fire_s_create_company(text, text);

create or replace function public.fire_s_create_company(p_name text, p_plan text default 'standard')
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
  v_role text;
  v_plan text := lower(nullif(trim(p_plan), ''));
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_name is null then
    v_name := 'Fire-S Company';
  end if;

  if v_plan is null or v_plan not in ('standard', 'seat', 'field', 'operations', 'executive', 'enterprise') then
    v_plan := 'standard';
  end if;

  -- Prefer the company this login already belongs to (active).
  select m.company_id, m.role
    into v_company_id, v_role
  from public.company_members as m
  join public.companies as c on c.id = m.company_id
  where m.user_id = v_uid
    and coalesce(m.status, 'active') = 'active'
  order by (
    select count(*)::int
    from public.company_members as cm
    where cm.company_id = m.company_id
      and coalesce(cm.status, 'active') = 'active'
  ) desc,
  c.name asc
  limit 1;

  -- Same founder must not start a second trial by re-registering.
  if v_company_id is null then
    select f.company_id into v_company_id
    from public.fire_s_trial_founders f
    where f.user_id = v_uid
    limit 1;
    v_role := coalesce(v_role, 'company_owner');
  end if;

  -- Inactive membership on a previous company still counts as the same tenant.
  if v_company_id is null then
    select m.company_id, m.role
      into v_company_id, v_role
    from public.company_members as m
    where m.user_id = v_uid
    order by case m.role when 'company_owner' then 0 when 'owner' then 1 else 2 end
    limit 1;
  end if;

  if v_company_id is not null then
    insert into public.company_members as cm (company_id, user_id, role, status)
    values (v_company_id, v_uid, coalesce(v_role, 'company_owner'), 'active')
    on conflict (company_id, user_id)
    do update set status = 'active';

    return query
      select c.id, c.name, coalesce(v_role, 'company_owner')::text
      from public.companies as c
      where c.id = v_company_id
      limit 1;
    return;
  end if;

  insert into public.companies as c (name, status, plan)
  values (v_name, 'active', v_plan)
  returning c.id into v_company_id;

  insert into public.company_members as cm (company_id, user_id, role, status)
  values (v_company_id, v_uid, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update set role = excluded.role, status = 'active';

  begin
    update public.profiles as p
       set role = 'company_owner'
     where p.id = v_uid;
  exception when others then
    null;
  end;

  return query
    select c.id, c.name, 'company_owner'::text
    from public.companies as c
    where c.id = v_company_id;
end;
$$;

grant execute on function public.fire_s_create_company(text, text) to authenticated;

-- start-fresh remains a Super Admin path only (trial-reset vector).
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

  insert into public.companies (name, status, plan)
  values (v_name, 'active', 'standard')
  returning id into v_company_id;

  insert into public.company_members as cm (company_id, user_id, role, status)
  values (v_company_id, v_uid, 'company_owner', 'active')
  on conflict (company_id, user_id)
  do update set role = 'company_owner', status = 'active';

  return query
    select c.id, c.name, 'company_owner'::text
    from public.companies c
    where c.id = v_company_id;
end;
$$;

grant execute on function public.fire_s_start_fresh_company(text) to authenticated;

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
  v_ends timestamptz;
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
         trial_ends_at = coalesce(c.trial_ends_at, c.trial_expires_at, now()) + make_interval(days => v_days),
         trial_expires_at = coalesce(c.trial_ends_at, c.trial_expires_at, now()) + make_interval(days => v_days),
         trial_inspection_limit = coalesce(c.trial_inspection_limit, public.fire_s_entitlement_limit()),
         entitlement_status = 'trial_active',
         entitlement_updated_at = now(),
         updated_at = now()
   where c.id = p_company_id
  returning trial_ends_at into v_ends;

  if v_ends is null then
    raise exception 'Company not found';
  end if;

  perform public.fire_s_audit_entitlement(
    p_company_id,
    'TRIAL_EXTENDED',
    jsonb_build_object('extra_days', v_days, 'trial_ends_at', v_ends)
  );

  return public.fire_s_refresh_entitlement_status(p_company_id);
end;
$$;

revoke all on function public.fire_s_start_company_trial(uuid) from public;
revoke all on function public.fire_s_start_company_trial(uuid) from anon;
revoke all on function public.fire_s_start_company_trial(uuid) from authenticated;
grant execute on function public.fire_s_start_company_trial(uuid) to service_role;

revoke all on function public.fire_s_compute_entitlement(uuid) from public;
revoke all on function public.fire_s_compute_entitlement(uuid) from anon;
revoke all on function public.fire_s_compute_entitlement(uuid) from authenticated;

comment on function public.fire_s_start_company_trial(uuid) is
  'Starts the one company trial. trial_started_at and trial_ends_at are now().';

commit;

notify pgrst, 'reload schema';

select 'fire_s 14-day company trial ready' as status;
