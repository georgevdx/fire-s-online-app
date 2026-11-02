import { loadPayfastConfig } from '../_shared/payfast-config.js';
import { cancelPayfastSubscription } from '../_shared/payfast-sign.js';

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
    'PAYFAST_SANDBOX_VALIDATE_URL',
    'PAYFAST_LIVE_MERCHANT_ID',
    'PAYFAST_LIVE_MERCHANT_KEY',
    'PAYFAST_LIVE_PASSPHRASE',
    'PAYFAST_LIVE_PROCESS_URL',
    'PAYFAST_LIVE_VALIDATE_URL',
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

function logEvent(event, extra) {
  const row = Object.assign({ fire_s: 'payfast_cancel', event: event }, extra || {});
  delete row.passphrase;
  delete row.merchantKey;
  delete row.signature;
  delete row.token;
  try {
    console.log(JSON.stringify(row));
  } catch (_) {}
}

async function getUser(req, env) {
  const auth = String(req.headers.get('authorization') || '');
  if (!/^bearer\s+/i.test(auth)) {
    const err = new Error('Sign in first, then cancel.');
    err.status = 401;
    throw err;
  }
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !anon) {
    const err = new Error('PayFast cancel is not configured.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: { Authorization: auth, apikey: anon }
  });
  if (!res.ok) {
    const err = new Error('Sign in first, then cancel.');
    err.status = 401;
    throw err;
  }
  return res.json();
}

async function rpc(env, name, body, key, useServiceRole) {
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = env.SUPABASE_ANON_KEY || '';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const authKey = useServiceRole ? serviceKey : key;
  if (!supabaseUrl || !authKey) {
    const err = new Error('PayFast cancel is not configured.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(supabaseUrl + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + authKey,
      apikey: useServiceRole ? serviceKey : anon || authKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(function () {
    return null;
  });
  if (!res.ok) {
    const hint =
      (data && (data.message || data.hint || data.details || data.error)) ||
      'PayFast cancel could not update the subscription.';
    const err = new Error(String(hint));
    err.status = res.status || 400;
    throw err;
  }
  return data;
}

async function note(env, companyId, ok, detail) {
  try {
    await rpc(
      env,
      'fire_s_note_payfast_remote_cancel',
      {
        p_company_id: companyId,
        p_ok: ok === true,
        p_detail: String(detail || '').slice(0, 180)
      },
      '',
      true
    );
  } catch (_) {}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'POST only' }, 405, req);
  }

  try {
    const env = envObject();
    const user = await getUser(req, env);
    const userJwt = String(req.headers.get('authorization') || '').replace(/^bearer\s+/i, '');
    await rpc(env, 'fire_s_cancel_company_subscription', {}, userJwt, false);

    const target = await rpc(
      env,
      'fire_s_payfast_cancel_target',
      { p_actor_user_id: user && user.id },
      '',
      true
    );
    const companyId = target && target.company_id;
    const token = target && target.token ? String(target.token).trim() : '';
    if (!token) {
      await note(env, companyId, true, 'No PayFast subscription token to cancel.');
      logEvent('CANCEL_NO_TOKEN', { company_id: companyId });
      return json(
        {
          ok: true,
          localCancelled: true,
          payfastCancelled: true,
          nothingToCancel: true
        },
        200,
        req
      );
    }

    const cfg = loadPayfastConfig(env);
    try {
      const result = await cancelPayfastSubscription(cfg, token);
      await note(env, companyId, true, result.already ? 'Already cancelled at PayFast.' : 'Cancelled at PayFast.');
      logEvent('CANCEL_REMOTE', { company_id: companyId, mode: cfg.mode, already: result.already === true });
      return json(
        {
          ok: true,
          localCancelled: true,
          payfastCancelled: true,
          nothingToCancel: false
        },
        200,
        req
      );
    } catch (err) {
      await note(env, companyId, false, 'PayFast did not confirm the stop.');
      logEvent('CANCEL_REMOTE_FAILED', {
        company_id: companyId,
        mode: cfg.mode,
        error: String((err && err.message) || 'PayFast cancel failed.').slice(0, 180)
      });
      return json(
        {
          ok: false,
          localCancelled: true,
          payfastCancelled: false,
          error:
            'Cancelled in Fire-S. PayFast did not confirm the stop, so the card can still be debited. Cancel it in the PayFast dashboard.'
        },
        502,
        req
      );
    }
  } catch (err) {
    const status = err && err.status ? err.status : 400;
    logEvent('CANCEL_FAILED', { error: String((err && err.message) || 'PayFast cancel failed.').slice(0, 180) });
    return json(
      {
        ok: false,
        localCancelled: false,
        payfastCancelled: false,
        error: String((err && err.message) || 'PayFast cancel failed.')
      },
      status >= 400 && status < 600 ? status : 400,
      req
    );
  }
});
