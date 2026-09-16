/**
 * PayFast ITN HTTP handler. PayFast has no JWT — verify_jwt is false.
 * Browser return_url / query / localStorage never activate a subscription.
 */

import { loadPayfastConfig, publicPayfastConfig, text } from './payfast-config.js';
import {
  parseItnFormBody,
  verifyPayfastItn,
  sanitisedItnFields,
  logSafeItn,
  amountGrossNumber
} from './payfast-itn-verify.js';

const REJECT_STATUS = {
  malformed: 400,
  invalid_signature: 400,
  origin_invalid: 400,
  origin_unresolved: 400,
  validate_incomplete: 400,
  validate_invalid: 400,
  wrong_amount: 400,
  unknown_company: 400,
  invalid_merchant: 400
};

export function envObject(envGet) {
  const read =
    envGet ||
    function (key) {
      try {
        return Deno.env.get(key);
      } catch (_) {
        return undefined;
      }
    };
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
  const out = {};
  for (let i = 0; i < keys.length; i += 1) {
    const val = read(keys[i]);
    if (val != null && val !== '') out[keys[i]] = val;
  }
  return out;
}

export function defaultResolveDns() {
  return async function (hostname, recordType) {
    if (typeof Deno !== 'undefined' && typeof Deno.resolveDns === 'function') {
      return Deno.resolveDns(hostname, recordType);
    }
    return [];
  };
}

function logEvent(event, extra) {
  const row = Object.assign({ fire_s: 'payfast_itn', event: event }, extra || {});
  delete row.passphrase;
  delete row.merchantKey;
  delete row.merchant_key;
  delete row.signature;
  delete row.token;
  try {
    console.log(JSON.stringify(row));
  } catch (_) {}
}

function itnResponse(status, body, extraHeaders) {
  const headers = Object.assign(
    { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    extraHeaders || {}
  );
  return new Response(body, { status: status, headers: headers });
}

function reject(reason, fields, extra) {
  const status = REJECT_STATUS[reason] || 400;
  logEvent('ITN_REJECTED', Object.assign(logSafeItn(fields, extra), { reason: reason, status: status }));
  return itnResponse(status, 'INVALID');
}

export async function applyPayfastItnRpc(env, verified, fetchImpl) {
  const supabaseUrl = text(env && env.SUPABASE_URL).replace(/\/$/, '');
  const serviceKey = text(env && env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    const err = new Error('ITN cannot apply without the billing service role.');
    err.status = 503;
    throw err;
  }
  const fields = verified.fields;
  const res = await (fetchImpl || fetch)(supabaseUrl + '/rest/v1/rpc/fire_s_apply_payfast_itn', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + serviceKey,
      apikey: serviceKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_m_payment_id: text(fields.m_payment_id),
      p_payfast_payment_id: text(fields.pf_payment_id),
      p_payment_status: text(fields.payment_status).toUpperCase(),
      p_amount: amountGrossNumber(fields),
      p_company_id: verified.companyId || null,
      p_token: text(fields.token) || null,
      p_plan_code: 'standard',
      p_billing_interval: (verified.expected && verified.expected.interval) || null,
      p_payload: sanitisedItnFields(fields)
    })
  });
  const data = await res.json().catch(function () {
    return null;
  });
  if (!res.ok) {
    const message = String((data && (data.message || data.hint || data.details || data.error)) || '');
    const err = new Error(message || 'ITN apply failed.');
    if (/Authoritative amount mismatch/i.test(message)) err.code = 'wrong_amount';
    else if (/Unknown company|payment reference|does not match/i.test(message)) err.code = 'unknown_company';
    else err.status = 500;
    throw err;
  }
  return Array.isArray(data) ? data[0] : data;
}

export async function handlePayfastItn(req, deps) {
  const d = deps || {};
  if (req.method === 'OPTIONS') {
    return itnResponse(204, '');
  }
  if (req.method !== 'POST') {
    return itnResponse(405, 'POST only');
  }

  let fields = null;
  try {
    const env = d.env || envObject(d.envGet);
    const cfg = d.cfg || loadPayfastConfig(env);
    if (!cfg.validateUrl) {
      return reject('validate_incomplete', {}, { error: 'validate url missing' });
    }

    const contentType = text(req.headers && (req.headers.get && req.headers.get('content-type')));
    if (contentType && /json/i.test(contentType)) {
      return reject('malformed', {}, { error: 'json body' });
    }

    const raw = await req.text();
    try {
      fields = parseItnFormBody(raw);
    } catch (parseErr) {
      return reject(parseErr.code || 'malformed', {}, { error: String(parseErr.message || parseErr) });
    }

    const verified = await verifyPayfastItn({
      fields: fields,
      cfg: cfg,
      headers: req.headers,
      fetch: d.fetch,
      resolveDns: d.resolveDns || defaultResolveDns(),
      knownIps: d.knownIps,
      trustedInterval: d.trustedInterval
    });
    if (!verified.ok) {
      return reject(verified.reason, fields, { detail: verified.missing || verified.got || verified.body });
    }

    const applied = await applyPayfastItnRpc(env, verified, d.fetch);
    const duplicate = !!(applied && (applied.duplicate || applied.already_processed));
    logEvent(duplicate ? 'ITN_DUPLICATE' : 'ITN_APPLIED', {
      m_payment_id: text(fields.m_payment_id),
      pf_payment_id: text(fields.pf_payment_id),
      payment_status: text(fields.payment_status),
      company_id: applied && applied.company_id,
      subscription_status: applied && applied.status,
      applied: !!(applied && applied.applied),
      already_processed: !!(applied && applied.already_processed),
      duplicate: duplicate,
      extended: !!(applied && applied.extended),
      mode: cfg.mode,
      public: publicPayfastConfig(cfg)
    });
    return itnResponse(200, 'OK');
  } catch (err) {
    const code = err && err.code;
    if (code && REJECT_STATUS[code]) {
      return reject(code, fields || {}, { error: String((err && err.message) || '') });
    }
    logEvent('ITN_ERROR', logSafeItn(fields || {}, { error: 'apply failed', status: Number(err && err.status) || 500 }));
    return itnResponse(Number(err && err.status) || 500, 'ERROR');
  }
}
