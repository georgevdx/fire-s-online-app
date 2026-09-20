-- Fire-S Test only. Do not run on live.
-- PayFast refuses checkout when email_address is the merchant account.
-- This signs a sandbox checkout as fires-toets-buyer@example.com.
--
-- 1. Run this file on Fire-S Test (SQL Editor).
-- 2. UPDATE the one secrets row with the SAME sandbox merchant id, key
--    and passphrase already set on the payfast-checkout Edge Function.
-- 3. Refresh the toets-blad with ?v=204 and tap Pay on PayFast.
--
-- Secrets stay in this table. Authenticated clients cannot read them.
-- Inspections stay. Nothing is deleted.

begin;

create table if not exists public.fire_s_payfast_sandbox_secrets (
  id integer primary key default 1 check (id = 1),
  merchant_id text not null default '',
  merchant_key text not null default '',
  passphrase text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.fire_s_payfast_sandbox_secrets (id, merchant_id, merchant_key, passphrase)
values (1, '', '', '')
on conflict (id) do nothing;

revoke all on table public.fire_s_payfast_sandbox_secrets from public;
revoke all on table public.fire_s_payfast_sandbox_secrets from anon;
revoke all on table public.fire_s_payfast_sandbox_secrets from authenticated;

create or replace function public.fire_s_payfast_php_encode(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v_bytes bytea := convert_to(trim(coalesce(p_value, '')), 'UTF8');
  v_out text := '';
  v_i int;
  v_b int;
begin
  if p_value is null or trim(p_value) = '' then
    return '';
  end if;
  for v_i in 0 .. octet_length(v_bytes) - 1 loop
    v_b := get_byte(v_bytes, v_i);
    if (v_b >= 48 and v_b <= 57)
       or (v_b >= 65 and v_b <= 90)
       or (v_b >= 97 and v_b <= 122)
       or v_b in (45, 46, 95, 126) then
      v_out := v_out || convert_from(substring(v_bytes from v_i + 1 for 1), 'UTF8');
    elsif v_b = 32 then
      v_out := v_out || '+';
    else
      v_out := v_out || '%' || upper(lpad(to_hex(v_b), 2, '0'));
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function public.fire_s_payfast_html_escape(p_value text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(replace(coalesce(p_value, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

create or replace function public.fire_s_sandbox_payfast_html(
  p_interval text default 'monthly',
  p_kind text default 'subscribe'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_super boolean := false;
  v_email text := '';
  v_company uuid;
  v_company_name text := 'Fire-S';
  v_role text := '';
  v_interval text := case when lower(trim(coalesce(p_interval, ''))) = 'annual' then 'annual' else 'monthly' end;
  v_kind text := case when lower(trim(coalesce(p_kind, ''))) = 'seat' then 'seat' else 'subscribe' end;
  v_amount text := case when lower(trim(coalesce(p_interval, ''))) = 'annual' then '2500.00' else '250.00' end;
  v_amount_n numeric := case when lower(trim(coalesce(p_interval, ''))) = 'annual' then 2500 else 250 end;
  v_mid text;
  v_mkey text;
  v_pass text;
  v_ref text;
  v_pending jsonb;
  v_item text;
  v_desc text;
  v_return text := 'https://georgevdx.github.io/fire-s-online-app/staging/index.html?payfast=ok';
  v_cancel text := 'https://georgevdx.github.io/fire-s-online-app/staging/index.html?payfast=cancel';
  v_notify text := 'https://ejqgzpkfcwocmtvwufwp.supabase.co/functions/v1/payfast-itn';
  v_process text := 'https://sandbox.payfast.co.za/eng/process';
  v_freq text;
  v_names text[] := ARRAY[
    'merchant_id', 'merchant_key', 'return_url', 'cancel_url', 'notify_url',
    'email_address', 'm_payment_id', 'amount', 'item_name', 'item_description',
    'custom_str1', 'custom_str2', 'custom_str3', 'custom_str4', 'custom_str5',
    'subscription_type', 'recurring_amount', 'frequency', 'cycles',
    'subscription_notify_webhook'
  ];
  v_vals text[];
  v_i int;
  v_sig_src text := '';
  v_sig text;
  v_html text := '';
begin
  if v_uid is null then
    raise exception 'Sign in first, then pay on PayFast.';
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = v_uid and lower(coalesce(p.role, '')) = 'super_admin'
  ) into v_super;

  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  if v_email is null or v_email = '' then
    raise exception 'Sign in first, then pay on PayFast.';
  end if;

  select s.merchant_id, s.merchant_key, s.passphrase
    into v_mid, v_mkey, v_pass
  from public.fire_s_payfast_sandbox_secrets s
  where s.id = 1;
  if nullif(trim(coalesce(v_mid, '')), '') is null
     or nullif(trim(coalesce(v_mkey, '')), '') is null
     or nullif(trim(coalesce(v_pass, '')), '') is null
     or v_mid ilike 'PASTE_%'
     or v_mkey ilike 'PASTE_%' then
    raise exception 'Paste the PayFast sandbox merchant id, key and passphrase into fire_s_payfast_sandbox_secrets, then tap Pay again.';
  end if;

  begin
    select mc.out_company_id, mc.out_company_name, mc.out_member_role
      into v_company, v_company_name, v_role
    from public.fire_s_my_company() mc;
  exception when others then
    v_company := null;
  end;

  if v_company is null then
    raise exception 'This company already exists. Reactivate it — do not create a new company.';
  end if;

  if not v_super
     and lower(coalesce(v_role, '')) not in ('company_owner', 'owner', 'super_admin') then
    raise exception 'Only the Owner can pay on PayFast.';
  end if;

  v_ref := 'fs-' || substr(v_kind, 1, 8) || '-' || replace(gen_random_uuid()::text, '-', '');
  v_pending := public.fire_s_begin_payfast_checkout(
    v_company,
    v_ref,
    'standard',
    v_interval,
    v_amount_n,
    v_kind,
    v_uid
  );
  if coalesce((v_pending->>'ok')::boolean, false) is not true then
    raise exception 'Could not start PayFast checkout. The payment was not sent.';
  end if;

  v_item := case when v_interval = 'annual' then 'Fire-S annual login' else 'Fire-S monthly login' end;
  v_desc := left('Owner login ' || v_email, 255);
  v_freq := case when v_interval = 'annual' then '6' else '3' end;
  v_vals := ARRAY[
    v_mid, v_mkey, v_return, v_cancel, v_notify,
    'fires-toets-buyer@example.com', v_ref, v_amount, v_item, v_desc,
    left(v_company::text, 255), left(v_email, 255), v_interval, left(v_kind, 255), left(v_email, 255),
    '1', v_amount, v_freq, '0',
    'true'
  ];

  for v_i in 1 .. array_length(v_names, 1) loop
    if nullif(v_vals[v_i], '') is null then
      continue;
    end if;
    if v_sig_src <> '' then
      v_sig_src := v_sig_src || '&';
    end if;
    v_sig_src := v_sig_src || v_names[v_i] || '=' || public.fire_s_payfast_php_encode(v_vals[v_i]);
  end loop;
  v_sig_src := v_sig_src || '&passphrase=' || public.fire_s_payfast_php_encode(v_pass);
  v_sig := md5(v_sig_src);

  v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"><title>PayFast</title></head><body>'
    || '<p>Redirecting to PayFast…</p>'
    || '<form id="payfast" method="POST" action="'
    || public.fire_s_payfast_html_escape(v_process)
    || '" accept-charset="utf-8">';
  for v_i in 1 .. array_length(v_names, 1) loop
    if nullif(v_vals[v_i], '') is null then
      continue;
    end if;
    v_html := v_html || '<input type="hidden" name="'
      || public.fire_s_payfast_html_escape(v_names[v_i])
      || '" value="'
      || public.fire_s_payfast_html_escape(v_vals[v_i])
      || '">';
  end loop;
  v_html := v_html || '<input type="hidden" name="signature" value="'
    || public.fire_s_payfast_html_escape(v_sig)
    || '"></form>'
    || '<script>document.getElementById("payfast").submit();</script>'
    || '</body></html>';
  return v_html;
end;
$$;

revoke all on function public.fire_s_sandbox_payfast_html(text, text) from public;
revoke all on function public.fire_s_sandbox_payfast_html(text, text) from anon;
grant execute on function public.fire_s_sandbox_payfast_html(text, text) to authenticated;

comment on function public.fire_s_sandbox_payfast_html(text, text) is
  'Toets sandbox checkout as a test buyer. Does not create a company. Does not add a login. Does not delete inspections.';

commit;

notify pgrst, 'reload schema';

-- Paste the same sandbox secrets already on payfast-checkout, then run this update:
-- update public.fire_s_payfast_sandbox_secrets
--    set merchant_id = 'YOUR_SANDBOX_MERCHANT_ID',
--        merchant_key = 'YOUR_SANDBOX_MERCHANT_KEY',
--        passphrase = 'YOUR_SANDBOX_PASSPHRASE',
--        updated_at = now()
--  where id = 1;

select 'fire_s sandbox buyer checkout ready — update fire_s_payfast_sandbox_secrets' as status;
