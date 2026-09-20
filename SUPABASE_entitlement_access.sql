-- Fire-S Phase 6: one server-authoritative company entitlement
-- Run AFTER SUPABASE_payfast_itn.sql on Fire-S Test.
-- Frontend may display this JSON. It must not invent access.
-- Expired/cancelled companies keep inspections, reports, photos, premises
-- in the cloud. The app cannot open them until a new subscription is active.
-- Super Admin keeps access. Sit live later.

begin;

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

create or replace function public.fire_s_check_company_entitlement(p_company_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.fire_s_get_company_entitlement(p_company_id);
end;
$$;

create or replace function public.fire_s_require_company_write(
  p_company_id uuid,
  p_operation text default 'write'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_info jsonb;
  v_reason text;
begin
  if public.fire_s_is_super_admin() then
    return jsonb_build_object('ok', true, 'super_admin', true, 'operation', p_operation);
  end if;

  v_info := public.fire_s_get_company_entitlement(p_company_id);
  if coalesce((v_info->>'can_create')::boolean, false) is true
     or coalesce((v_info->>'allowed')::boolean, false) is true then
    return v_info || jsonb_build_object('ok', true, 'operation', p_operation);
  end if;

  v_reason := coalesce(v_info->>'reason', 'subscription_required');
  raise exception 'FIRE_S_ENTITLEMENT:%:%',
    v_reason,
    'A Fire-S subscription is required for ' || coalesce(nullif(trim(p_operation), ''), 'this company action');
end;
$$;

create or replace function public.fire_s_company_members_entitlement_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_info jsonb;
begin
  if auth.uid() is null then
    return NEW;
  end if;
  if public.fire_s_is_super_admin() then
    return NEW;
  end if;
  if tg_op <> 'INSERT' then
    return NEW;
  end if;
  if not exists (
    select 1
    from public.company_members m
    where m.company_id = NEW.company_id
      and m.id is distinct from NEW.id
  ) then
    return NEW;
  end if;

  -- Same login already on this company: upsert / reactivate, not a new paid seat.
  if exists (
    select 1
    from public.company_members m
    where m.company_id = NEW.company_id
      and m.user_id = NEW.user_id
      and m.id is distinct from NEW.id
  ) then
    return NEW;
  end if;

  v_info := public.fire_s_compute_entitlement(NEW.company_id);
  if coalesce((v_info->>'can_create')::boolean, false) is not true
     and coalesce((v_info->>'allowed')::boolean, false) is not true then
    raise exception 'FIRE_S_ENTITLEMENT:%:%',
      coalesce(v_info->>'reason', 'subscription_required'),
      'A Fire-S subscription is required to add company logins';
  end if;
  return NEW;
end;
$$;

drop trigger if exists fire_s_company_members_entitlement_guard on public.company_members;
create trigger fire_s_company_members_entitlement_guard
  before insert on public.company_members
  for each row
  execute procedure public.fire_s_company_members_entitlement_guard();

-- New inspection cycles reuse the same premises row (UPDATE), so INSERT-only
-- guards are not enough. History growth / a new inspection number with a blank
-- checklist is a paid create, not a draft save.
create or replace function public.fire_s_inspection_starts_new_cycle(p_old jsonb, p_new jsonb)
returns boolean
language sql
immutable
as $$
  select
    p_new is not null
    and (
      (
        public.fire_s_inspection_is_finalised(p_old)
        and not public.fire_s_inspection_is_finalised(p_new)
      )
      or (
        jsonb_typeof(coalesce(p_new->'inspectionHistory', '[]'::jsonb)) = 'array'
        and jsonb_array_length(coalesce(p_new->'inspectionHistory', '[]'::jsonb))
            > jsonb_array_length(coalesce(p_old->'inspectionHistory', '[]'::jsonb))
      )
      or (
        (
          (
            nullif(trim(coalesce(p_new->>'inspectionNumber', '')), '') is not null
            and coalesce(p_new->>'inspectionNumber', '')
                is distinct from coalesce(p_old->>'inspectionNumber', '')
          )
          or (
            nullif(trim(coalesce(p_new->>'currentInspectionId', '')), '') is not null
            and coalesce(p_new->>'currentInspectionId', '')
                is distinct from coalesce(p_old->>'currentInspectionId', '')
          )
        )
        and (
          p_new->'answers' is null
          or p_new->'answers' = '[]'::jsonb
          or p_new->'answers' = '{}'::jsonb
        )
      )
    );
$$;

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
  end if;

  v_was := tg_op = 'UPDATE' and public.fire_s_inspection_is_finalised(OLD.inspection_data);
  v_now := public.fire_s_inspection_is_finalised(NEW.inspection_data);
  v_id := coalesce(NEW.id::text, OLD.id::text);

  perform pg_advisory_xact_lock(hashtext('fire_s_entitlement:' || v_company::text));

  -- Compute only: do not refresh/write company rows from this trigger.
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

  if tg_op = 'UPDATE'
     and not v_now
     and public.fire_s_inspection_starts_new_cycle(OLD.inspection_data, NEW.inspection_data) then
    if coalesce((v_info->>'can_create')::boolean, false) is not true then
      raise exception 'FIRE_S_ENTITLEMENT:%:%',
        coalesce(v_reason, 'subscription_required'),
        'A subscription is required to start a new inspection cycle';
    end if;
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
    if coalesce((v_info->>'can_write_draft')::boolean, false) is not true
       and coalesce((v_info->>'allowed')::boolean, false) is not true then
      raise exception 'FIRE_S_ENTITLEMENT:%:%',
        coalesce(v_reason, 'subscription_required'),
        'Inspections stay in the cloud. A subscription is required to open or change them';
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

revoke all on function public.fire_s_get_company_entitlement(uuid) from public;
revoke all on function public.fire_s_get_company_entitlement(uuid) from anon;
grant execute on function public.fire_s_get_company_entitlement(uuid) to authenticated;

revoke all on function public.fire_s_require_company_write(uuid, text) from public;
revoke all on function public.fire_s_require_company_write(uuid, text) from anon;
grant execute on function public.fire_s_require_company_write(uuid, text) to authenticated;

revoke all on function public.fire_s_company_can_read_inspections(uuid) from public;
revoke all on function public.fire_s_company_can_read_inspections(uuid) from anon;
grant execute on function public.fire_s_company_can_read_inspections(uuid) to authenticated;
grant execute on function public.fire_s_company_can_read_inspections(uuid) to service_role;

comment on function public.fire_s_get_company_entitlement(uuid) is
  'Authoritative Fire-S company access. Browser localStorage/URL must not override this. Cancelled companies keep rows (keep_data) but can_read is false until a new subscription is active.';

commit;

notify pgrst, 'reload schema';

select 'fire_s get company entitlement ready' as status;
