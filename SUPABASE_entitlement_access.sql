-- Fire-S Phase 6: one server-authoritative company entitlement
-- Run AFTER SUPABASE_payfast_itn.sql on Fire-S Test.
-- Frontend may display this JSON. It must not invent access.
-- Expired/cancelled companies keep inspections, reports, photos, premises.
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
    'can_read', true,
    'can_export', true,
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

revoke all on function public.fire_s_get_company_entitlement(uuid) from public;
revoke all on function public.fire_s_get_company_entitlement(uuid) from anon;
grant execute on function public.fire_s_get_company_entitlement(uuid) to authenticated;

revoke all on function public.fire_s_require_company_write(uuid, text) from public;
revoke all on function public.fire_s_require_company_write(uuid, text) from anon;
grant execute on function public.fire_s_require_company_write(uuid, text) to authenticated;

comment on function public.fire_s_get_company_entitlement(uuid) is
  'Authoritative Fire-S company access. Browser localStorage/URL must not override this.';

commit;

notify pgrst, 'reload schema';

select 'fire_s get company entitlement ready' as status;
