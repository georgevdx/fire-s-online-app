import { md5hex } from './payfast-md5.js';
import { text } from './payfast-config.js';

export const PAYFAST_FIELD_ORDER = [
  'merchant_id',
  'merchant_key',
  'return_url',
  'cancel_url',
  'notify_url',
  'name_first',
  'name_last',
  'email_address',
  'cell_number',
  'm_payment_id',
  'amount',
  'item_name',
  'item_description',
  'custom_int1',
  'custom_int2',
  'custom_int3',
  'custom_int4',
  'custom_int5',
  'custom_str1',
  'custom_str2',
  'custom_str3',
  'custom_str4',
  'custom_str5',
  'email_confirmation',
  'confirmation_address',
  'payment_method',
  'subscription_type',
  'billing_date',
  'recurring_amount',
  'frequency',
  'cycles',
  'subscription_notify_email',
  'subscription_notify_webhook',
  'subscription_notify_buyer'
];

export function phpUrlEncode(value) {
  return encodeURIComponent(String(value == null ? '' : value).trim())
    .replace(/[!'()*~]/g, function (ch) {
      return '%' + ch.charCodeAt(0).toString(16).toUpperCase();
    })
    .replace(/%20/g, '+')
    .replace(/%[0-9a-f]{2}/gi, function (hex) {
      return hex.toUpperCase();
    });
}

export function signatureParamString(fields, passphrase) {
  const parts = [];
  PAYFAST_FIELD_ORDER.forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) return;
    const val = text(fields[key]);
    if (!val) return;
    parts.push(key + '=' + phpUrlEncode(val));
  });
  let getString = parts.join('&');
  if (text(passphrase)) getString += '&passphrase=' + phpUrlEncode(passphrase);
  return getString;
}

export function generateSignature(fields, passphrase) {
  return md5hex(signatureParamString(fields, passphrase));
}

export function formatAmount(rand) {
  let n = Number(rand);
  if (!isFinite(n) || n <= 0) n = 0;
  return n.toFixed(2);
}

export const SERVER_PRICES = {
  monthly: 250,
  annual: 2500
};

export function amountForInterval(interval) {
  const id = text(interval).toLowerCase() === 'annual' ? 'annual' : 'monthly';
  return formatAmount(SERVER_PRICES[id]);
}

export function newMerchantPaymentId(kind) {
  const prefix = 'fs-' + text(kind || 'sub').slice(0, 8);
  let rand = '';
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      rand = globalThis.crypto.randomUUID();
    }
  } catch (_) {}
  if (!rand) {
    rand = Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
  }
  return (prefix + '-' + rand).slice(0, 100);
}

/**
 * Plan, price, company and m_payment_id are decided here.
 * Untrusted body may only suggest interval/kind/seat email.
 * Never read amount, price, plan, companyId or mPaymentId from the browser.
 */
export function resolveAuthoritativeCheckout(trusted, untrustedBody) {
  const body = untrustedBody || {};
  const interval = text(body.interval).toLowerCase() === 'annual' ? 'annual' : 'monthly';
  const kind = text(body.kind).toLowerCase() === 'seat' ? 'seat' : 'subscribe';
  const companyId = text(trusted && trusted.companyId);
  const email = text(trusted && trusted.email).toLowerCase();
  if (!companyId) {
    throw new Error('Company is required before PayFast checkout.');
  }
  if (!email) {
    throw new Error('Sign in first, then pay on PayFast.');
  }
  return {
    planCode: 'standard',
    interval: interval,
    kind: kind,
    amount: amountForInterval(interval),
    amountNumber: interval === 'annual' ? SERVER_PRICES.annual : SERVER_PRICES.monthly,
    companyId: companyId,
    companyName: text(trusted && trusted.companyName) || 'Fire-S',
    email: email,
    seatEmail: kind === 'seat' ? text(body.seatEmail).toLowerCase() : '',
    mPaymentId: newMerchantPaymentId(kind)
  };
}

/** PayFast refuses checkout when email_address is the merchant account. */
export function payfastBuyerEmail(cfg, realEmail) {
  const owner = text(realEmail).toLowerCase();
  if (cfg && (cfg.sandbox === true || cfg.mode === 'sandbox')) {
    const forced = text(cfg.sandboxBuyerEmail).toLowerCase();
    const buyer = forced || 'fires-toets-buyer@example.com';
    if (owner && buyer === owner) return 'fires-toets-buyer@example.com';
    return buyer;
  }
  return owner || 'test@test.com';
}

export function assertSandboxCheckout(cfg) {
  if (!cfg || cfg.mode !== 'sandbox') {
    throw new Error('PayFast checkout is sandbox-only until go-live.');
  }
  if (!/sandbox\.payfast\.co\.za/i.test(text(cfg.processUrl))) {
    throw new Error('PayFast checkout is sandbox-only until go-live.');
  }
}

export function buildSignedCheckoutFields(cfg, info) {
  const interval = text(info && info.interval).toLowerCase() === 'annual' ? 'annual' : 'monthly';
  const amount = amountForInterval(interval);
  const kind = text(info && info.kind) || 'subscribe';
  const companyId = text(info && info.companyId);
  const company = text(info && info.company) || 'Fire-S';
  const email = text(info && info.email).toLowerCase();
  const seatEmail = text(info && info.seatEmail).toLowerCase();
  const payerEmail = payfastBuyerEmail(cfg, email);
  const itemName = interval === 'annual' ? 'Fire-S annual login' : 'Fire-S monthly login';
  const desc =
    kind === 'seat' ? 'Extra login ' + (seatEmail || email) : 'Owner login ' + email;
  const mPaymentId =
    text(info && info.mPaymentId) ||
    'fs-' +
      kind.slice(0, 8) +
      '-' +
      Date.now().toString(36) +
      '-' +
      Math.floor(Math.random() * 1e6).toString(36);

  const fields = {
    merchant_id: text(cfg.merchantId),
    merchant_key: text(cfg.merchantKey),
    return_url: text(cfg.returnUrl),
    cancel_url: text(cfg.cancelUrl),
    notify_url: text(cfg.notifyUrl),
    email_address: payerEmail,
    m_payment_id: mPaymentId,
    amount: amount,
    item_name: itemName,
    item_description: desc.slice(0, 255),
    custom_str1: (companyId || company).slice(0, 255),
    custom_str2: email.slice(0, 255),
    custom_str3: interval,
    custom_str4: kind.slice(0, 255),
    custom_str5: (seatEmail || email).slice(0, 255),
    subscription_type: '1',
    recurring_amount: amount,
    frequency: interval === 'annual' ? '6' : '3',
    cycles: '0',
    subscription_notify_webhook: 'true'
  };
  fields.signature = generateSignature(fields, cfg.passphrase);
  return fields;
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
  });
}

export function checkoutAutoPostHtml(processUrl, fields) {
  const inputs = Object.keys(fields)
    .map(function (name) {
      return (
        '<input type="hidden" name="' +
        escapeHtml(name) +
        '" value="' +
        escapeHtml(fields[name]) +
        '">'
      );
    })
    .join('');
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>PayFast</title></head>' +
    '<body>' +
    '<p>Redirecting to PayFast…</p>' +
    '<form id="payfast" method="POST" action="' +
    escapeHtml(processUrl) +
    '" accept-charset="utf-8">' +
    inputs +
    '</form>' +
    '<script>document.getElementById("payfast").submit();</script>' +
    '</body></html>'
  );
}
