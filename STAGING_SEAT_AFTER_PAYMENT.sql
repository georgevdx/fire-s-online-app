-- Fire-S Test only (top-left must say Fire-S Test).
-- Do NOT run this on fireye-sync until this workflow sits live.
-- Run after SUPABASE_payfast_checkout.sql.
-- Stores the extra-login email on the checkout row.
-- Invites that email only after PayFast ITN status is COMPLETE.
-- Does not delete inspections. Does not invite when payment failed.

begin;

drop function if exists public.fire_s_begin_payfast_checkout(uuid, text, text, text, numeric, text, uuid);

create or replace function public.fire_s_begin_payfast_checkout(
  p_company_id uuid,
  p_m_payment_id text,
  p_plan_code text,
  p_billing_interval text,
  p_amount numeric,
  p_kind text default 'subscribe',
  p_actor_user_id uuid default null,
  p_seat_email text default null,
  p_seat_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := nullif(trim(p_m_payment_id), '');
  v_plan text := lower(nullif(trim(p_plan_code), ''));
  v_interval text := lower(nullif(trim(p_billing_interval), ''));
  v_kind text := lower(nullif(trim(p_kind), ''));
  v_amount numeric := p_amount;
  v_expected numeric;
  v_sub uuid;
  v_event uuid;
  v_company_name text;
  v_seat_email text := null;
  v_seat_role text := null;
begin
  if p_company_id is null then
    raise exception 'Company required';
  end if;
  if v_ref is null or length(v_ref) < 8 then
    raise exception 'Payment reference required';
  end if;

  select c.name into v_company_name
  from public.companies c
  where c.id = p_company_id;
  if v_company_name is null then
    raise exception 'Company not found';
  end if;

  if p_actor_user_id is not null
     and not exists (
       select 1
       from public.company_members m
       where m.company_id = p_company_id
         and m.user_id = p_actor_user_id
         and coalesce(m.status, 'active') = 'active'
     )
     and not exists (
       select 1
       from public.profiles p
       where p.id = p_actor_user_id
         and lower(coalesce(p.role, '')) = 'super_admin'
     ) then
    raise exception 'Not a member of this company';
  end if;

  if v_plan is null or v_plan not in ('standard', 'seat') then
    v_plan := 'standard';
  end if;
  if v_interval is null or v_interval not in ('monthly', 'annual') then
    v_interval := 'monthly';
  end if;
  if v_kind is null or v_kind not in ('subscribe', 'seat') then
    v_kind := 'subscribe';
  end if;

  if v_kind = 'seat' then
    v_seat_email := lower(nullif(trim(p_seat_email), ''));
    v_seat_role := lower(nullif(trim(p_seat_role), ''));
    if v_seat_role is null or v_seat_role not in ('inspector', 'manager', 'viewer', 'company_owner') then
      v_seat_role := 'inspector';
    end if;
    if v_seat_email is null or position('@' in v_seat_email) < 1 then
      v_seat_email := null;
      v_seat_role := null;
    end if;
  end if;

  v_expected := case when v_interval = 'annual' then 2500 else 250 end;
  if v_amount is null or v_amount <> v_expected then
    raise exception 'Authoritative amount mismatch';
  end if;

  begin
    perform public.fire_s_sync_subscription_from_company(p_company_id);
  exception when others then
    null;
  end;
  perform set_config('fire_s.entitlement_write', 'on', true);

  -- Cancelled / expired companies must be able to start PayFast again.
  update public.fire_s_company_subscriptions s
     set status = 'payment_pending',
         provider = 'payfast',
         plan_code = v_plan,
         billing_interval = v_interval,
         updated_at = now()
   where s.company_id = p_company_id
  returning s.id into v_sub;

  if v_sub is null then
    insert into public.fire_s_company_subscriptions (
      company_id,
      provider,
      plan_code,
      billing_interval,
      status
    )
    values (p_company_id, 'payfast', v_plan, v_interval, 'payment_pending')
    returning id into v_sub;
  end if;

  v_event := public.fire_s_record_payment_event(
    p_company_id,
    null,
    v_ref,
    v_expected,
    'payment_pending',
    'checkout',
    jsonb_build_object(
      'm_payment_id', v_ref,
      'plan_code', v_plan,
      'billing_interval', v_interval,
      'amount', v_expected,
      'kind', v_kind,
      'mode', 'sandbox',
      'activates_on_return_url', false,
      'seat_email', v_seat_email,
      'seat_role', v_seat_role,
      'actor_user_id', p_actor_user_id
    ),
    null,
    'payfast',
    now()
  );

  begin
    perform public.fire_s_audit_entitlement(
      p_company_id,
      'CHECKOUT_STARTED',
      jsonb_build_object(
        'm_payment_id', v_ref,
        'plan_code', v_plan,
        'billing_interval', v_interval,
        'amount', v_expected,
        'kind', v_kind,
        'payment_event_id', v_event,
        'subscription_id', v_sub,
        'actor_user_id', p_actor_user_id,
        'seat_email', v_seat_email,
        'seat_role', v_seat_role
      )
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'status', 'payment_pending',
    'activated', false,
    'company_id', p_company_id,
    'company_name', v_company_name,
    'subscription_id', v_sub,
    'payment_event_id', v_event,
    'm_payment_id', v_ref,
    'plan_code', v_plan,
    'billing_interval', v_interval,
    'amount', v_expected
  );
end;
$$;

revoke all on function public.fire_s_begin_payfast_checkout(uuid, text, text, text, numeric, text, uuid, text, text) from public;
revoke all on function public.fire_s_begin_payfast_checkout(uuid, text, text, text, numeric, text, uuid, text, text) from anon;
revoke all on function public.fire_s_begin_payfast_checkout(uuid, text, text, text, numeric, text, uuid, text, text) from authenticated;
grant execute on function public.fire_s_begin_payfast_checkout(uuid, text, text, text, numeric, text, uuid, text, text) to service_role;

create or replace function public.fire_s_grant_paid_seat(p_m_payment_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m text := nullif(trim(p_m_payment_id), '');
  v_company uuid;
  v_payload jsonb;
  v_email text;
  v_role text;
  v_actor uuid;
  v_target uuid;
  v_owner text;
begin
  if v_m is null or length(v_m) < 8 then
    raise exception 'Payment reference required';
  end if;

  if not exists (
    select 1
      from public.fire_s_payment_events e
     where e.m_payment_id = v_m
       and e.payment_status = 'COMPLETE'
  ) then
    raise exception 'Seat invite waits for a completed payment';
  end if;

  select e.company_id, e.payload
    into v_company, v_payload
    from public.fire_s_payment_events e
   where e.m_payment_id = v_m
     and e.event_type = 'checkout'
   order by e.created_at desc
   limit 1;

  if v_company is null then
    raise exception 'Unknown company or payment reference';
  end if;

  v_email := lower(nullif(trim(v_payload->>'seat_email'), ''));
  v_role := lower(nullif(trim(v_payload->>'seat_role'), ''));
  if v_email is null or position('@' in v_email) < 1 then
    select lower(nullif(trim(e.payload->>'custom_str5'), '')),
           lower(nullif(trim(e.payload->>'custom_str2'), ''))
      into v_email, v_owner
      from public.fire_s_payment_events e
     where e.m_payment_id = v_m
       and e.payment_status = 'COMPLETE'
     order by e.created_at desc
     limit 1;
    if v_email is not null and v_email = v_owner then
      v_email := null;
    end if;
  end if;

  if v_email is null or position('@' in v_email) < 1 then
    raise exception 'Seat email required';
  end if;
  if v_role is null or v_role not in ('inspector', 'manager', 'viewer', 'company_owner') then
    v_role := 'inspector';
  end if;

  begin
    v_actor := nullif(trim(v_payload->>'actor_user_id'), '')::uuid;
  exception when others then
    v_actor := null;
  end;

  select p.id
    into v_target
    from public.profiles p
   where lower(trim(p.email)) = v_email
   limit 1;

  if v_target is null then
    select u.id
      into v_target
      from auth.users u
     where lower(trim(u.email)) = v_email
     limit 1;
  end if;

  if v_target is not null and exists (
    select 1
      from public.company_members m
     where m.user_id = v_target
       and coalesce(m.status, 'active') = 'active'
       and m.company_id <> v_company
  ) then
    return jsonb_build_object('ok', false, 'status', 'other_company', 'email', v_email);
  end if;

  perform set_config('fire_s.entitlement_write', 'on', true);

  if v_target is not null then
    begin
      insert into public.company_members (company_id, user_id, role, status)
      values (v_company, v_target, v_role, 'active')
      on conflict (company_id, user_id)
      do update set role = excluded.role, status = 'active';
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'status', 'other_company', 'email', v_email);
    end;

    update public.company_invites
       set status = 'accepted',
           role = v_role
     where company_id = v_company
       and lower(trim(email)) = v_email;

    begin
      update public.profiles set role = v_role where id = v_target;
    exception when others then
      null;
    end;

    return jsonb_build_object('ok', true, 'status', 'added', 'email', v_email, 'role', v_role);
  end if;

  update public.company_invites
     set role = v_role,
         status = case when status = 'accepted' then status else 'pending' end,
         created_by = coalesce(created_by, v_actor)
   where company_id = v_company
     and lower(trim(email)) = v_email;

  if not found then
    insert into public.company_invites (company_id, email, role, status, created_by)
    values (v_company, v_email, v_role, 'pending', v_actor);
  end if;

  return jsonb_build_object('ok', true, 'status', 'invited', 'email', v_email, 'role', v_role);
end;
$$;

revoke all on function public.fire_s_grant_paid_seat(text) from public;
revoke all on function public.fire_s_grant_paid_seat(text) from anon;
revoke all on function public.fire_s_grant_paid_seat(text) from authenticated;
grant execute on function public.fire_s_grant_paid_seat(text) to service_role;

commit;

notify pgrst, 'reload schema';

select 'paid seat invite waits for PayFast COMPLETE' as status;
