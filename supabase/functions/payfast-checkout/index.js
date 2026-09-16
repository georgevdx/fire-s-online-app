import { loadPayfastConfig, publicPayfastConfig } from '../_shared/payfast-config.js';
import { buildSignedCheckoutFields, checkoutAutoPostHtml } from '../_shared/payfast-sign.js';

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
  for (const key of [
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
    'SUPABASE_ANON_KEY'
  ]) {
    const val = Deno.env.get(key);
    if (val != null) out[key] = val;
  }
  return out;
}

async function getUser(req, env) {
  const auth = String(req.headers.get('authorization') || '');
  if (!/^bearer\s+/i.test(auth)) {
    throw new Error('Sign in first, then pay on PayFast.');
  }
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !anon) {
    throw new Error('PayFast checkout is not configured.');
  }
  const res = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: {
      Authorization: auth,
      apikey: anon
    }
  });
  if (!res.ok) {
    throw new Error('Sign in first, then pay on PayFast.');
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
    const user = await getUser(req, env);
    const email = String((user && user.email) || '').trim().toLowerCase();
    if (!email) {
      throw new Error('Sign in first, then pay on PayFast.');
    }

    let body = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    const companyRow = await myCompany(req, env);
    const role = String(
      (companyRow && (companyRow.out_member_role || companyRow.role)) || ''
    ).toLowerCase();
    if (
      role &&
      role !== 'company_owner' &&
      role !== 'owner' &&
      role !== 'super_admin' &&
      role !== 'manager'
    ) {
      throw new Error('Only the Owner can pay on PayFast.');
    }

    const fields = buildSignedCheckoutFields(cfg, {
      kind: body.kind,
      interval: body.interval,
      company: body.company || (companyRow && (companyRow.out_company_name || companyRow.name)),
      companyId: body.companyId || (companyRow && (companyRow.out_company_id || companyRow.id)),
      email: email,
      seatEmail: body.seatEmail,
      mPaymentId: body.mPaymentId
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
    const message = String((err && err.message) || 'PayFast is not ready.');
    const safe = /passphrase|merchant_key|merchant key/i.test(message)
      ? 'PayFast is not configured on the server.'
      : message;
    return json(
      {
        error: safe,
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
      400,
      req
    );
  }
});
