import { loadPayfastConfig, publicPayfastConfig } from '../_shared/payfast-config.js';
import {
  assertSandboxCheckout,
  buildSignedCheckoutFields,
  checkoutAutoPostHtml,
  resolveAuthoritativeCheckout
} from '../_shared/payfast-sign.js';

const ALLOWED_ORIGINS = [
  'https://georgevdx.github.io',
  'http://127.0.0.1:8787',
  'http://localhost:8787'
];

function corsHeaders(req) {
  const origin = String(req.headers.get('origin') || '');
  const allow = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  };
}

function json(body, status, req) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(req))
  });
}

function envObject() {
  const out = {};
  const keys = [
    'PAYFAST_MODE',
    'PAYFAST_ALLOW_LIVE',
    'PAYFAST_SANDBOX_MERCHANT_ID',
    'PAYFAST_SANDBOX_MERCHANT_KEY',
    'PAYFAST_SANDBOX_PASSPHRASE',
    'PAYFAST_SANDBOX_PROCESS_URL',
    'PAYFAST_LIVE_MERCHANT_ID',
    'PAYFAST_LIVE_MERCHANT_KEY',
    'PAYFAST_LIVE_PASSPHRASE',
    'PAYFAST_LIVE_PROCESS_URL',
    'PAYFAST_MERCHANT_ID',
    'PAYFAST_MERCHANT_KEY',
    'PAYFAST_PASSPHRASE',
    'FIRE_S_PUBLIC_URL',
    'PAYFAST_RETURN_URL',
    'PAYFAST_CANCEL_URL',
    'PAYFAST_NOTIFY_URL',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  for (const key of keys) {
    const val = Deno.env.get(key);
    if (val != null) out[key] = val;
  }
  return out;
}

function safeMessage(err) {
  const message = String((err && err.message) || 'PayFast is not ready.');
  if (/passphrase|merchant_key|merchant key|service_role|SERVICE_ROLE/i.test(message)) {
    return 'PayFast is not configured on the server.';
  }
  return message;
}

function logEvent(event, extra) {
  const row = Object.assign({ fire_s: 'payfast_checkout', event: event }, extra || {});
  delete row.passphrase;
  delete row.merchantKey;
  delete row.signature;
  try {
    console.log(JSON.stringify(row));
  } catch (_) {}
}

async function getUser(req, env) {
  const auth = String(req.headers.get('authorization') || '');
  if (!/^bearer\s+/i.test(auth)) {
    const err = new Error('Sign in first, then pay on PayFast.');
    err.status = 401;
    throw err;
  }
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !anon) {
    const err = new Error('PayFast checkout is not configured.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: {
      Authorization: auth,
      apikey: anon
    }
  });
  if (!res.ok) {
    const err = new Error('Sign in first, then pay on PayFast.');
    err.status = 401;
    throw err;
  }
  return res.json();
}

async function myCompany(req, env) {
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = env.SUPABASE_ANON_KEY || '';
  const res = await fetch(supabaseUrl + '/rest/v1/rpc/fire_s_my_company', {
    method: 'POST',
    headers: {
      Authorization: String(req.headers.get('authorization') || ''),
      apikey: anon,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  if (!res.ok) return null;
  const data = await res.json();
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

function canCheckout(role, kind) {
  const r = String(role || '').toLowerCase();
  if (r === 'company_owner' || r === 'owner' || r === 'super_admin') return true;
  if (kind === 'seat' && r === 'manager') return true;
  return false;
}

async function beginPending(env, checkout, actorUserId) {
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    const err = new Error('PayFast checkout cannot record the payment. Try again.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(supabaseUrl + '/rest/v1/rpc/fire_s_begin_payfast_checkout', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + serviceKey,
      apikey: serviceKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_company_id: checkout.companyId,
      p_m_payment_id: checkout.mPaymentId,
      p_plan_code: checkout.planCode,
      p_billing_interval: checkout.interval,
      p_amount: checkout.amountNumber,
      p_kind: checkout.kind,
      p_actor_user_id: actorUserId || null
    })
  });
  const data = await res.json().catch(function () {
    return null;
  });
  if (!res.ok) {
    const hint =
      (data && (data.message || data.hint || data.details || data.error)) ||
      'Could not start PayFast checkout. The payment was not sent.';
    const err = new Error(String(hint));
    err.status = 500;
    throw err;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405, req);
  }

  try {
    const env = envObject();
    const cfg = loadPayfastConfig(env);
    assertSandboxCheckout(cfg);

    const user = await getUser(req, env);
    const email = String((user && user.email) || '').trim().toLowerCase();
    if (!email) {
      const err = new Error('Sign in first, then pay on PayFast.');
      err.status = 401;
      throw err;
    }

    let body = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    const companyRow = await myCompany(req, env);
    const companyId = String(
      (companyRow && (companyRow.out_company_id || companyRow.company_id || companyRow.id)) || ''
    ).trim();
    const companyName = String(
      (companyRow && (companyRow.out_company_name || companyRow.company_name || companyRow.name)) ||
        ''
    ).trim();
    if (!companyId) {
      const err = new Error('Create your company first, then pay on PayFast.');
      err.status = 400;
      throw err;
    }

    const checkout = resolveAuthoritativeCheckout(
      { companyId: companyId, companyName: companyName, email: email },
      body
    );

    const role = String(
      (companyRow && (companyRow.out_member_role || companyRow.role)) || ''
    ).toLowerCase();
    if (!canCheckout(role, checkout.kind)) {
      const err = new Error('Only the Owner can pay on PayFast.');
      err.status = 403;
      throw err;
    }

    const pending = await beginPending(env, checkout, user && user.id);
    if (!pending || pending.ok !== true || pending.activated === true) {
      const err = new Error('Could not start PayFast checkout. The payment was not sent.');
      err.status = 500;
      throw err;
    }

    const fields = buildSignedCheckoutFields(cfg, {
      kind: checkout.kind,
      interval: checkout.interval,
      company: checkout.companyName,
      companyId: checkout.companyId,
      email: checkout.email,
      seatEmail: checkout.seatEmail,
      mPaymentId: checkout.mPaymentId
    });

    logEvent('CHECKOUT_STARTED', {
      company_id: checkout.companyId,
      m_payment_id: checkout.mPaymentId,
      plan_code: checkout.planCode,
      billing_interval: checkout.interval,
      amount: checkout.amount,
      kind: checkout.kind,
      mode: 'sandbox',
      notify_url: cfg.notifyUrl,
      activates_on_return_url: false
    });

    const html = checkoutAutoPostHtml(cfg.processUrl, fields);
    return new Response(html, {
      status: 200,
      headers: Object.assign(
        { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        corsHeaders(req)
      )
    });
  } catch (err) {
    const status = Number(err && err.status) || 400;
    const safe = safeMessage(err);
    logEvent('CHECKOUT_FAILED', { error: safe, status: status });
    return json(
      {
        error: safe,
        activated: false,
        public: publicPayfastConfig(
          (function () {
            try {
              return loadPayfastConfig(envObject());
            } catch (_) {
              return { mode: 'sandbox' };
            }
          })()
        )
      },
      status,
      req
    );
  }
});
