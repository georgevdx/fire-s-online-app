-- Fire-S Phase 4: record payment_pending before PayFast checkout
-- Run AFTER SUPABASE_company_subscriptions.sql on Fire-S Test.
-- service_role only. Does not activate a subscription.
-- Does not delete inspections.

begin;

create or replace function public.fire_s_begin_payfast_checkout(
  p_company_id uuid,
  p_m_payment_id text,
  p_plan_code text,
  p_billing_interval text,
  p_amount numeric,
  p_kind text default 'subscribe',
  p_actor_user_id uuid default null
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
      'activates_on_return_url', false
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
        'actor_user_id', p_actor_user_id
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

revoke all on function public.fire_s_begin_payfast_checkout(uuid, text, text, text, numeric, text, uuid) from public;
revoke all on function public.fire_s_begin_payfast_checkout(uuid, text, text, text, numeric, text, uuid) from anon;
revoke all on function public.fire_s_begin_payfast_checkout(uuid, text, text, text, numeric, text, uuid) from authenticated;
grant execute on function public.fire_s_begin_payfast_checkout(uuid, text, text, text, numeric, text, uuid) to service_role;

commit;

notify pgrst, 'reload schema';

select 'fire_s payfast checkout pending ready' as status;
