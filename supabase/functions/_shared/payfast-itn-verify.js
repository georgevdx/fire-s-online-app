/**
 * PayFast Instant Transaction Notification (ITN) verification.
 *
 * Current PayFast process (developers.payfast.co.za — Confirm payment):
 *  1. Receive posted fields.
 *  2. Rebuild the parameter string from posted vars excluding signature
 *     (PHP urlencode, uppercase hex, spaces as +).
 *  3. MD5(paramString + passphrase) and compare to posted signature.
 *  4. Confirm the request originated from a documented PayFast host
 *     (www / sandbox / w1w / w2w) by resolving those hosts to IPs.
 *  5. POST the same param string (no passphrase) to
 *     https://{sandbox|www}.payfast.co.za/eng/query/validate
 *     and accept only the exact body VALID.
 *  6. Match merchant_id and amount_gross to server-side Fire-S values.
 *
 * Do not continue if any step is incomplete. Browser return_url is not used.
 */

import { md5hex } from './payfast-md5.js';
import { phpUrlEncode } from './payfast-sign.js';
import { PAYFAST_VALID_HOSTS, text } from './payfast-config.js';
import { SERVER_PRICES, formatAmount, amountForInterval } from './payfast-sign.js';

export { PAYFAST_VALID_HOSTS, SERVER_PRICES };

export const ITN_REQUIRED_FIELDS = [
  'm_payment_id',
  'pf_payment_id',
  'payment_status',
  'item_name',
  'merchant_id',
  'signature'
];

export const ITN_PAYMENT_STATUSES = ['COMPLETE', 'FAILED', 'CANCELLED'];

export const ITN_FIELD_ORDER = [
  'm_payment_id',
  'pf_payment_id',
  'payment_status',
  'item_name',
  'item_description',
  'amount_gross',
  'amount_fee',
  'amount_net',
  'custom_str1',
  'custom_str2',
  'custom_str3',
  'custom_str4',
  'custom_str5',
  'custom_int1',
  'custom_int2',
  'custom_int3',
  'custom_int4',
  'custom_int5',
  'name_first',
  'name_last',
  'email_address',
  'merchant_id',
  'token',
  'billing_date'
];

export function parseItnFormBody(raw) {
  const source = String(raw == null ? '' : raw);
  if (!source.trim()) {
    const err = new Error('Empty PayFast ITN body.');
    err.code = 'malformed';
    throw err;
  }
  if (/^\s*[\{\[]/.test(source)) {
    const err = new Error('PayFast ITN must be application/x-www-form-urlencoded.');
    err.code = 'malformed';
    throw err;
  }
  const fields = {};
  const order = [];
  source.split('&').forEach(function (pair) {
    if (!pair) return;
    const idx = pair.indexOf('=');
    const rawKey = idx === -1 ? pair : pair.slice(0, idx);
    const rawVal = idx === -1 ? '' : pair.slice(idx + 1);
    let key;
    let val;
    try {
      key = decodeURIComponent(String(rawKey).replace(/\+/g, ' '));
      val = decodeURIComponent(String(rawVal).replace(/\+/g, ' '));
    } catch (_) {
      const err = new Error('PayFast ITN body is not valid form data.');
      err.code = 'malformed';
      throw err;
    }
    if (!key) return;
    fields[key] = val;
    order.push(key);
  });
  fields.__order = order;
  return fields;
}

export function postedKeys(fields) {
  if (fields && Array.isArray(fields.__order) && fields.__order.length) {
    const seen = {};
    return fields.__order.filter(function (key) {
      if (key === '__order' || seen[key]) return false;
      seen[key] = true;
      return Object.prototype.hasOwnProperty.call(fields, key);
    });
  }
  return ITN_FIELD_ORDER.filter(function (key) {
    return fields && Object.prototype.hasOwnProperty.call(fields, key);
  });
}

/**
 * Parameter string PayFast prescribes for ITN signature + /eng/query/validate.
 * Posted order, every posted key except signature, PHP urlencode.
 * Empty posted values are included (official ITN sample).
 */
export function itnParamString(fields) {
  const parts = [];
  postedKeys(fields).forEach(function (key) {
    if (key === 'signature' || key === '__order') return;
    const val = fields[key] == null ? '' : String(fields[key]);
    parts.push(key + '=' + phpUrlEncode(val));
  });
  return parts.join('&');
}

export function itnSignatureString(fields, passphrase) {
  let param = itnParamString(fields);
  if (text(passphrase)) param += '&passphrase=' + phpUrlEncode(passphrase);
  return param;
}

export function generateItnSignature(fields, passphrase) {
  return md5hex(itnSignatureString(fields, passphrase));
}

export function verifyItnSignature(fields, passphrase) {
  const posted = text(fields && fields.signature).toLowerCase();
  if (!posted || posted.length !== 32) {
    return { ok: false, reason: 'invalid_signature' };
  }
  const expected = generateItnSignature(fields, passphrase);
  if (posted !== expected) {
    return { ok: false, reason: 'invalid_signature' };
  }
  return { ok: true, expected: expected };
}

export function requiredItnFields(fields) {
  const missing = [];
  ITN_REQUIRED_FIELDS.forEach(function (key) {
    if (!text(fields && fields[key])) missing.push(key);
  });
  const status = text(fields && fields.payment_status).toUpperCase();
  if (status && ITN_PAYMENT_STATUSES.indexOf(status) === -1) {
    return { ok: false, reason: 'malformed', missing: missing, payment_status: status };
  }
  if (missing.length) {
    return { ok: false, reason: 'malformed', missing: missing };
  }
  if (status === 'COMPLETE' && !text(fields && fields.amount_gross)) {
    return { ok: false, reason: 'malformed', missing: ['amount_gross'] };
  }
  if (status === 'COMPLETE' && !text(fields && fields.token)) {
    return { ok: false, reason: 'malformed', missing: ['token'] };
  }
  return { ok: true, payment_status: status };
}

export function verifyMerchantId(fields, merchantId) {
  if (text(fields && fields.merchant_id) !== text(merchantId)) {
    return { ok: false, reason: 'invalid_merchant' };
  }
  return { ok: true };
}

export function amountGrossNumber(fields) {
  const raw = text(fields && (fields.amount_gross || fields.amount));
  if (!raw) return null;
  const n = Number(raw);
  if (!isFinite(n)) return null;
  return n;
}

export function intervalFromItn(fields) {
  const custom = text(fields && fields.custom_str3).toLowerCase();
  if (custom === 'annual' || custom === 'monthly') return custom;
  const gross = amountGrossNumber(fields);
  if (gross != null && Math.abs(gross - SERVER_PRICES.annual) <= 0.01) return 'annual';
  if (gross != null && Math.abs(gross - SERVER_PRICES.monthly) <= 0.01) return 'monthly';
  return '';
}

export function expectedServerAmount(fields, trustedInterval) {
  const interval =
    text(trustedInterval).toLowerCase() === 'annual'
      ? 'annual'
      : text(trustedInterval).toLowerCase() === 'monthly'
        ? 'monthly'
        : intervalFromItn(fields);
  if (!interval) return null;
  return {
    interval: interval,
    amount: amountForInterval(interval),
    amountNumber: interval === 'annual' ? SERVER_PRICES.annual : SERVER_PRICES.monthly
  };
}

export function verifyAmountAgainstServerPrice(fields, trustedInterval) {
  const status = text(fields && fields.payment_status).toUpperCase();
  const expected = expectedServerAmount(fields, trustedInterval);
  const gross = amountGrossNumber(fields);
  if (status === 'CANCELLED' && (gross == null || gross <= 0)) {
    return { ok: true, skipped: true, expected: expected };
  }
  if (!expected) {
    return { ok: false, reason: 'wrong_amount' };
  }
  if (gross == null || Math.abs(gross - expected.amountNumber) > 0.01) {
    return { ok: false, reason: 'wrong_amount', expected: expected.amount, got: formatAmount(gross || 0) };
  }
  return { ok: true, expected: expected };
}

export function companyIdFromItn(fields) {
  return text(fields && fields.custom_str1);
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text(value)
  );
}

export function clientIpsFromHeaders(headers) {
  const get = headerGet(headers);
  const ips = [];
  function push(raw) {
    String(raw || '')
      .split(',')
      .map(function (part) {
        return part.trim().replace(/^\[/, '').replace(/\]$/, '');
      })
      .forEach(function (ip) {
        if (!ip) return;
        if (ip.indexOf(':') !== -1 && ip.indexOf('.') !== -1) {
          ip = ip.split(':')[0];
        }
        if (ips.indexOf(ip) === -1) ips.push(ip);
      });
  }
  push(get('cf-connecting-ip'));
  push(get('x-real-ip'));
  push(get('x-forwarded-for'));
  push(get('x-client-ip'));
  return ips;
}

function headerGet(headers) {
  if (!headers) {
    return function () {
      return '';
    };
  }
  if (typeof headers.get === 'function') {
    return function (name) {
      return headers.get(name) || '';
    };
  }
  return function (name) {
    const lower = name.toLowerCase();
    const key = Object.keys(headers).find(function (k) {
      return k.toLowerCase() === lower;
    });
    return key ? headers[key] : '';
  };
}

export function refererHost(headers) {
  const get = headerGet(headers);
  const ref = text(get('referer') || get('referrer'));
  if (!ref) return '';
  try {
    return new URL(ref).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

export async function resolvePayfastHostIps(resolveDns) {
  const resolve =
    resolveDns ||
    async function () {
      return [];
    };
  const ips = [];
  for (let i = 0; i < PAYFAST_VALID_HOSTS.length; i += 1) {
    const host = PAYFAST_VALID_HOSTS[i];
    for (const type of ['A', 'AAAA']) {
      try {
        const found = await resolve(host, type);
        (found || []).forEach(function (ip) {
          const clean = text(ip);
          if (clean && ips.indexOf(clean) === -1) ips.push(clean);
        });
      } catch (_) {}
    }
  }
  return ips;
}

export async function verifyPayfastOrigin(headers, resolveDns, knownIps) {
  const validIps = Array.isArray(knownIps) && knownIps.length ? knownIps.slice() : await resolvePayfastHostIps(resolveDns);
  if (!validIps.length) {
    return { ok: false, reason: 'origin_unresolved' };
  }
  const clientIps = clientIpsFromHeaders(headers);
  const host = refererHost(headers);
  if (host && PAYFAST_VALID_HOSTS.indexOf(host) !== -1) {
    return { ok: true, via: 'referer_host', host: host };
  }
  for (let i = 0; i < clientIps.length; i += 1) {
    if (validIps.indexOf(clientIps[i]) !== -1) {
      return { ok: true, via: 'ip', ip: clientIps[i] };
    }
  }
  if (host) {
    try {
      const resolve = resolveDns || async function () { return []; };
      const extra = [].concat(await resolve(host, 'A'), await resolve(host, 'AAAA'));
      for (let j = 0; j < extra.length; j += 1) {
        if (validIps.indexOf(text(extra[j])) !== -1) {
          return { ok: true, via: 'referer_ip', host: host };
        }
      }
    } catch (_) {}
  }
  return { ok: false, reason: 'origin_invalid' };
}

export async function confirmItnWithPayfast(paramString, validateUrl, fetchImpl) {
  const url = text(validateUrl);
  if (!url || !/\/eng\/query\/validate\/?$/i.test(url)) {
    return { ok: false, reason: 'validate_incomplete' };
  }
  const fetchFn = fetchImpl || fetch;
  let res;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: paramString
    });
  } catch (_) {
    return { ok: false, reason: 'validate_incomplete' };
  }
  if (!res || !res.ok) {
    return { ok: false, reason: 'validate_incomplete' };
  }
  const body = text(await res.text()).replace(/\s+/g, '');
  if (body !== 'VALID') {
    return { ok: false, reason: 'validate_invalid', body: body.slice(0, 32) };
  }
  return { ok: true };
}

export function sanitisedItnFields(fields) {
  const out = {};
  postedKeys(fields).forEach(function (key) {
    if (
      key === 'signature' ||
      key === 'passphrase' ||
      key === 'merchant_key' ||
      key === 'token' ||
      key === '__order'
    ) {
      return;
    }
    out[key] = fields[key];
  });
  return out;
}

export function logSafeItn(fields, extra) {
  const row = Object.assign(
    {
      m_payment_id: text(fields && fields.m_payment_id).slice(0, 100),
      pf_payment_id: text(fields && fields.pf_payment_id).slice(0, 40),
      payment_status: text(fields && fields.payment_status).slice(0, 20),
      merchant_id: text(fields && fields.merchant_id).slice(0, 16),
      amount_gross: text(fields && fields.amount_gross).slice(0, 16),
      custom_str1: text(fields && fields.custom_str1).slice(0, 40),
      custom_str3: text(fields && fields.custom_str3).slice(0, 16)
    },
    extra || {}
  );
  delete row.passphrase;
  delete row.merchantKey;
  delete row.merchant_key;
  delete row.signature;
  delete row.token;
  return row;
}

/**
 * Full ITN verification. Returns { ok: true, fields, paramString, expected }
 * or { ok: false, reason }. Never applies billing.
 */
export async function verifyPayfastItn(input) {
  const fields = input && input.fields;
  const cfg = input && input.cfg;
  if (!fields || typeof fields !== 'object') {
    return { ok: false, reason: 'malformed' };
  }
  const required = requiredItnFields(fields);
  if (!required.ok) return required;

  const merchant = verifyMerchantId(fields, cfg && cfg.merchantId);
  if (!merchant.ok) return merchant;

  const signature = verifyItnSignature(fields, cfg && cfg.passphrase);
  if (!signature.ok) return signature;

  const origin = await verifyPayfastOrigin(input.headers, input.resolveDns, input.knownIps);
  if (!origin.ok) return origin;

  const amount = verifyAmountAgainstServerPrice(fields, input.trustedInterval);
  if (!amount.ok) return amount;

  const paramString = itnParamString(fields);
  const confirmed = await confirmItnWithPayfast(paramString, cfg && cfg.validateUrl, input.fetch);
  if (!confirmed.ok) return confirmed;

  const companyId = companyIdFromItn(fields);
  if (companyId && !isUuid(companyId)) {
    return { ok: false, reason: 'unknown_company' };
  }

  return {
    ok: true,
    fields: fields,
    paramString: paramString,
    payment_status: required.payment_status,
    expected: amount.expected,
    companyId: companyId,
    origin: origin
  };
}
