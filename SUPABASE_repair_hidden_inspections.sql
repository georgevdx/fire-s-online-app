-- Fire-S: restore inspections that vanished after the trial/entitlement SQL
-- Paste ALL into Supabase → SQL Editor → Run on LIVE and on Fire-S Test.
--
-- This script does NOT delete inspections, companies, photos, or reports.
-- The entitlement SQL never truncated inspections either. Rows are almost
-- always still in public.inspections; they were hidden by RLS / company_id
-- / a stale PostgREST schema cache.
--
-- Fire-S Test hit inspections_company_id_fkey because inspection JSON still
-- named company 5b59914c-… after that company was deleted. This script skips
-- dead company ids and commits the SELECT policy before backfill.

begin;

-- 1) Recreate SELECT so members can see company inspections again.
--    (Insert/update policies from entitlement SQL are kept, then SELECT
--    is guaranteed to exist even if an earlier repair dropped all policies.)
drop policy if exists "fire_s_inspections_select" on public.inspections;
create policy "fire_s_inspections_select"
  on public.inspections for select to authenticated
  using (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
    or public.fire_s_is_super_admin()
  );

drop policy if exists "fire_s_inspections_delete" on public.inspections;
create policy "fire_s_inspections_delete"
  on public.inspections for delete to authenticated
  using (
    user_id = auth.uid()
    or public.fire_s_is_company_member(company_id)
    or public.fire_s_is_super_admin()
  );

alter table public.inspections enable row level security;
alter table public.inspections no force row level security;

-- 2) Existing rows must stay updatable. SQL Editor (no JWT) must not
--    raise "Not a member" during backfill. New trial limits still apply
--    to NEW inspections and NEW finalisations.
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
  if auth.uid() is null then
    return NEW;
  end if;

  if public.fire_s_is_super_admin() then
    return NEW;
  end if;

  v_company := coalesce(
    NEW.company_id,
    case when tg_op = 'UPDATE' then OLD.company_id else null end
  );

  if v_company is null then
    select m.company_id into v_company
    from public.company_members m
    where m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
    limit 1;
    if v_company is not null then
      NEW.company_id := v_company;
    end if;
  end if;

  if tg_op = 'UPDATE' and v_company is null then
    return NEW;
  end if;

  if v_company is null then
    raise exception 'FIRE_S_ENTITLEMENT:subscription_required:Company required';
  end if;

  if NEW.company_id is not null
     and not public.fire_s_is_company_member(NEW.company_id)
     and not public.fire_s_is_super_admin() then
    if tg_op = 'INSERT' then
      raise exception 'FIRE_S_ENTITLEMENT:subscription_required:Not a member of this company';
    elsif tg_op = 'UPDATE' and OLD.user_id is distinct from auth.uid() then
      raise exception 'FIRE_S_ENTITLEMENT:subscription_required:Not a member of this company';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and OLD.company_id is not null
     and NEW.company_id is distinct from OLD.company_id then
    NEW.company_id := OLD.company_id;
    v_company := OLD.company_id;
  end if;

  v_was := tg_op = 'UPDATE' and public.fire_s_inspection_is_finalised(OLD.inspection_data);
  v_now := public.fire_s_inspection_is_finalised(NEW.inspection_data);
  v_id := coalesce(NEW.id::text, case when tg_op = 'UPDATE' then OLD.id::text else null end);

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

commit;

-- 3) Stamp orphan inspections onto a company that STILL EXISTS.
--    Fire-S Test failed here before: inspection JSON still had
--    companyId 5b59914c-… after that company was deleted, and the
--    foreign key rolled back the whole script (including SELECT).
--    Never copy a dead UUID onto inspections.company_id.
begin;

alter table public.inspections disable trigger fire_s_inspections_entitlement_guard;

update public.inspections i
   set company_id = x.company_id,
       inspection_data = coalesce(i.inspection_data, '{}'::jsonb)
         || jsonb_build_object(
              'companyId', x.company_id,
              'company_id', x.company_id
            )
  from (
    select distinct on (m.user_id)
           m.user_id,
           m.company_id
      from public.company_members m
      join public.companies c on c.id = m.company_id
     where coalesce(m.status, 'active') = 'active'
     order by m.user_id,
              (
                select count(*)::int
                from public.inspections i2
                where i2.company_id = m.company_id
              ) desc,
              m.company_id
  ) x
 where i.company_id is null
   and i.user_id = x.user_id;

update public.inspections i
   set company_id = c.id
  from public.companies c
 where i.company_id is null
   and c.id::text = nullif(trim(coalesce(
         i.inspection_data->>'companyId',
         i.inspection_data->>'company_id',
         ''
       )), '')
   and nullif(trim(coalesce(
         i.inspection_data->>'companyId',
         i.inspection_data->>'company_id',
         ''
       )), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

alter table public.inspections enable trigger fire_s_inspections_entitlement_guard;

-- 4) Existing customers (never started a trial) keep full access.
select set_config('fire_s.entitlement_write', 'on', true);

update public.companies c
   set entitlement_status = 'subscription_active',
       subscription_status = 'active',
       subscription_plan_id = coalesce(c.subscription_plan_id, c.plan, 'standard'),
       subscription_started_at = coalesce(c.subscription_started_at, c.created_at, now()),
       billing_status = coalesce(nullif(c.billing_status, ''), 'active'),
       entitlement_updated_at = now()
 where c.trial_started_at is null
   and coalesce(c.subscription_status, '') not in ('cancelled', 'suspended');

commit;

notify pgrst, 'reload schema';

select
  (select count(*) from public.inspections) as inspection_rows,
  (select count(*) from public.inspections where company_id is null) as still_null_company,
  (select count(*) from public.inspections where company_id is not null) as with_company,
  (select count(*) from pg_policies
     where schemaname = 'public'
       and tablename = 'inspections'
       and cmd = 'SELECT') as inspection_select_policies,
  exists (
    select 1 from public.companies c
    where c.id = '5b59914c-58c3-4eed-ba88-48573020b26e'
  ) as deleted_test_company_still_present;
