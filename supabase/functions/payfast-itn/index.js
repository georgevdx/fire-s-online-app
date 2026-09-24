import { loadPayfastConfig, publicPayfastConfig } from '../_shared/payfast-config.js';
import {
  parseItnFields,
  verifyItnSignature
} from '../_shared/payfast-sign.js';

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
    'PAYFAST_LIVE_BUYER_EMAIL',
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
  const row = Object.assign({ fire_s: 'payfast_itn', event: event }, extra || {});
  delete row.passphrase;
  delete row.merchantKey;
  delete row.signature;
  try {
    console.log(JSON.stringify(row));
  } catch (_) {}
}

function okResponse() {
  return new Response('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function failResponse(message, status) {
  return new Response(String(message || 'INVALID'), {
    status: status || 400,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function validateWithPayfast(cfg, rawBody) {
  const res = await fetch(cfg.validateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: rawBody
  });
  const textBody = String((await res.text()) || '').trim().toUpperCase();
  return res.ok && textBody.indexOf('VALID') === 0;
}

async function applyItn(env, fields, payload) {
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    throw new Error('PayFast ITN cannot update the subscription.');
  }
  const res = await fetch(supabaseUrl + '/rest/v1/rpc/fire_s_apply_payfast_itn', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + serviceKey,
      apikey: serviceKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_m_payment_id: fields.mPaymentId,
      p_payfast_payment_id: fields.payfastPaymentId,
      p_payment_status: fields.paymentStatus,
      p_amount: fields.amount,
      p_company_id: fields.companyId,
      p_token: fields.token || null,
      p_plan_code: fields.planCode,
      p_billing_interval: fields.billingInterval,
      p_payload: payload || {}
    })
  });
  const data = await res.json().catch(function () {
    return null;
  });
  if (!res.ok) {
    const hint =
      (data && (data.message || data.hint || data.details || data.error)) ||
      'PayFast ITN could not apply.';
    throw new Error(String(hint));
  }
  return data;
}

function payloadObject(params) {
  const out = {};
  if (params && typeof params.forEach === 'function') {
    params.forEach(function (value, key) {
      if (key === 'signature') return;
      out[key] = String(value == null ? '' : value);
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'POST') {
    return failResponse('POST only', 405);
  }

  const rawBody = await req.text();
  let params;
  try {
    params = new URLSearchParams(rawBody);
  } catch (_) {
    logEvent('ITN_BAD_BODY', {});
    return failResponse('INVALID', 400);
  }

  try {
    const env = envObject();
    const cfg = loadPayfastConfig(env);
    const postedSignature = String(params.get('signature') || '').trim();
    if (!verifyItnSignature(params, cfg.passphrase, postedSignature)) {
      logEvent('ITN_BAD_SIGNATURE', { mode: cfg.mode });
      return failResponse('INVALID', 400);
    }

    const fields = parseItnFields(params);
    if (fields.merchantId && fields.merchantId !== cfg.merchantId) {
      logEvent('ITN_MERCHANT_MISMATCH', { mode: cfg.mode });
      return failResponse('INVALID', 400);
    }
    if (!fields.payfastPaymentId || !fields.paymentStatus) {
      logEvent('ITN_MISSING_FIELDS', { mode: cfg.mode });
      return failResponse('INVALID', 400);
    }

    const valid = await validateWithPayfast(cfg, rawBody);
    if (!valid) {
      logEvent('ITN_VALIDATE_FAILED', {
        mode: cfg.mode,
        m_payment_id: fields.mPaymentId,
        pf_payment_id: fields.payfastPaymentId
      });
      return failResponse('INVALID', 400);
    }

    const applied = await applyItn(env, fields, payloadObject(params));
    logEvent('ITN_APPLIED', {
      mode: cfg.mode,
      m_payment_id: fields.mPaymentId,
      pf_payment_id: fields.payfastPaymentId,
      payment_status: fields.paymentStatus,
      company_id: fields.companyId,
      public: publicPayfastConfig(cfg)
    });
    return applied ? okResponse() : failResponse('INVALID', 400);
  } catch (err) {
    logEvent('ITN_FAILED', { error: String((err && err.message) || 'PayFast ITN failed.') });
    return failResponse('INVALID', 400);
  }
});
