import assert from 'node:assert';
import crypto from 'node:crypto';
import { loadPayfastConfig } from '../supabase/functions/_shared/payfast-config.js';
import { phpUrlEncode } from '../supabase/functions/_shared/payfast-sign.js';
import {
  parseItnFormBody,
  generateItnSignature,
  itnParamString,
  verifyItnSignature,
  verifyAmountAgainstServerPrice,
  verifyPayfastItn,
  requiredItnFields,
  sanitisedItnFields,
  logSafeItn
} from '../supabase/functions/_shared/payfast-itn-verify.js';
import { handlePayfastItn } from '../supabase/functions/_shared/payfast-itn-handler.js';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const PF_IP = '197.97.145.148';
const PASSPHRASE = 'test-sandbox-pass';

const cfg = loadPayfastConfig({
  PAYFAST_MODE: 'sandbox',
  PAYFAST_SANDBOX_MERCHANT_ID: '10000100',
  PAYFAST_SANDBOX_MERCHANT_KEY: 'test-sandbox-key',
  PAYFAST_SANDBOX_PASSPHRASE: PASSPHRASE,
  FIRE_S_PUBLIC_URL: 'https://georgevdx.github.io/fire-s-online-app/staging/',
  SUPABASE_URL: 'https://ejqgzpkfcwocmtvwufwp.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test'
});

function unsignedFields(overrides) {
  return Object.assign(
    {
      m_payment_id: 'fs-sub-checkout-ref-001',
      pf_payment_id: '1089250',
      payment_status: 'COMPLETE',
      item_name: 'Fire-S monthly login',
      item_description: 'Owner login owner@acme.test',
      amount_gross: '250.00',
      amount_fee: '-5.75',
      amount_net: '244.25',
      custom_str1: COMPANY_ID,
      custom_str2: 'owner@acme.test',
      custom_str3: 'monthly',
      custom_str4: 'subscribe',
      custom_str5: 'owner@acme.test',
      name_first: 'Ada',
      name_last: 'Owner',
      email_address: 'owner@acme.test',
      merchant_id: '10000100',
      token: '11111111-2222-4333-8444-555555555555'
    },
    overrides || {}
  );
}

function signedFields(overrides) {
  const fields = unsignedFields(overrides);
  fields.signature = generateItnSignature(fields, PASSPHRASE);
  return fields;
}

function formBody(fields) {
  return Object.keys(fields)
    .filter(function (key) {
      return key !== '__order';
    })
    .map(function (key) {
      return key + '=' + phpUrlEncode(fields[key]);
    })
    .join('&');
}

function headers(extra) {
  return {
    get: function (name) {
      const row = Object.assign(
        {
          'content-type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': PF_IP
        },
        extra || {}
      );
      const key = Object.keys(row).find(function (k) {
        return k.toLowerCase() === String(name).toLowerCase();
      });
      return key ? row[key] : null;
    }
  };
}

function request(fields, extraHeaders, method) {
  return {
    method: method || 'POST',
    headers: headers(extraHeaders),
    text: async function () {
      return formBody(fields);
    }
  };
}

function memoryBilling() {
  const state = {
    companies: new Set([COMPANY_ID]),
    checkout: {
      'fs-sub-checkout-ref-001': { companyId: COMPANY_ID, interval: 'monthly', amount: 250 }
    },
    events: [],
    subscription: {
      company_id: COMPANY_ID,
      status: 'payment_pending',
      billing_interval: 'monthly',
      current_period_end: null,
      payfast_payment_id: null,
      payfast_subscription_token: null,
      extend_count: 0,
      payment_count: 0
    }
  };

  function apply(body) {
    const m = body.p_m_payment_id;
    const pf = body.p_payfast_payment_id;
    const status = String(body.p_payment_status || '').toUpperCase();
    const amount = Number(body.p_amount);
    const checkout = state.checkout[m];
    const company = checkout ? checkout.companyId : null;
    if (!company || !state.companies.has(company)) {
      const err = new Error('Unknown company or payment reference');
      err.status = 400;
      throw err;
    }
    if (body.p_company_id && body.p_company_id !== company) {
      const err = new Error('Company does not match payment reference');
      err.status = 400;
      throw err;
    }
    const expected = checkout.interval === 'annual' ? 2500 : 250;
    if (status !== 'CANCELLED' && Math.abs(amount - expected) > 0.01) {
      const err = new Error('Authoritative amount mismatch');
      err.status = 400;
      throw err;
    }
    const existing = state.events.find(function (row) {
      return row.payfast_payment_id === pf && row.payment_status === status;
    });
    if (existing && existing.processed_at) {
      return {
        ok: true,
        applied: false,
        extended: false,
        duplicate: true,
        already_processed: true,
        company_id: company,
        status: state.subscription.status,
        current_period_end: state.subscription.current_period_end,
        payment_count: state.subscription.payment_count,
        extend_count: state.subscription.extend_count
      };
    }
    if (state.subscription.payfast_payment_id === pf && state.subscription.status === 'active' && status === 'COMPLETE') {
      return {
        ok: true,
        applied: false,
        extended: false,
        duplicate: true,
        already_processed: true,
        company_id: company,
        status: 'active',
        current_period_end: state.subscription.current_period_end,
        payment_count: state.subscription.payment_count,
        extend_count: state.subscription.extend_count
      };
    }
    const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    if (status === 'COMPLETE') {
      state.subscription.status = 'active';
      state.subscription.payfast_payment_id = pf;
      state.subscription.payfast_subscription_token = body.p_token;
      state.subscription.current_period_end = periodEnd;
      state.subscription.extend_count += 1;
      state.subscription.payment_count += 1;
    } else if (status === 'FAILED') {
      state.subscription.status = 'past_due';
      state.subscription.payfast_payment_id = pf;
    } else {
      state.subscription.status = 'cancelled';
      state.subscription.payfast_payment_id = pf;
    }
    state.events.push({
      payfast_payment_id: pf,
      payment_status: status,
      processed_at: new Date().toISOString(),
      company_id: company,
      amount: amount
    });
    return {
      ok: true,
      applied: true,
      extended: status === 'COMPLETE',
      duplicate: false,
      already_processed: false,
      company_id: company,
      status: state.subscription.status,
      current_period_end: state.subscription.current_period_end,
      payment_count: state.subscription.payment_count,
      extend_count: state.subscription.extend_count
    };
  }

  return { state, apply };
}

function testFetch(billing, options) {
  const opts = options || {};
  const calls = { validate: 0, apply: 0, other: 0 };
  const fetchImpl = async function (url, init) {
    const href = String(url);
    if (href.indexOf('/eng/query/validate') !== -1) {
      calls.validate += 1;
      const body = opts.validateBody != null ? opts.validateBody : 'VALID';
      const ok = opts.validateOk != null ? opts.validateOk : true;
      return {
        ok: ok,
        text: async function () {
          return body;
        }
      };
    }
    if (href.indexOf('fire_s_apply_payfast_itn') !== -1) {
      calls.apply += 1;
      let payload = {};
      try {
        payload = JSON.parse(init.body);
      } catch (_) {}
      try {
        const result = billing.apply(payload);
        return {
          ok: true,
          json: async function () {
            return result;
          }
        };
      } catch (err) {
        return {
          ok: false,
          json: async function () {
            return { message: err.message };
          }
        };
      }
    }
    calls.other += 1;
    throw new Error('unexpected fetch ' + href);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const knownIps = [PF_IP];

async function send(fields, extras) {
  const extra = extras || {};
  const billing = extra.billing || memoryBilling();
  const fetchImpl = extra.fetch || testFetch(billing, extra);
  const res = await handlePayfastItn(request(fields, extra.headers, extra.method), {
    env: {
      PAYFAST_MODE: 'sandbox',
      PAYFAST_SANDBOX_MERCHANT_ID: '10000100',
      PAYFAST_SANDBOX_MERCHANT_KEY: 'test-sandbox-key',
      PAYFAST_SANDBOX_PASSPHRASE: PASSPHRASE,
      SUPABASE_URL: 'https://ejqgzpkfcwocmtvwufwp.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test'
    },
    cfg: cfg,
    fetch: fetchImpl,
    knownIps: extra.knownIps || knownIps,
    resolveDns: extra.resolveDns
  });
  return { res, billing, fetchImpl, text: await res.text() };
}

// --- signature helper matches Node crypto ---
const sample = unsignedFields();
const param = itnParamString(sample);
const expectedSig = crypto.createHash('md5').update(param + '&passphrase=' + phpUrlEncode(PASSPHRASE), 'utf8').digest('hex');
assert.strictEqual(generateItnSignature(sample, PASSPHRASE), expectedSig);
assert.ok(verifyItnSignature(signedFields(), PASSPHRASE).ok);

// --- valid notification ---
{
  const { res, billing, fetchImpl, text } = await send(signedFields());
  assert.strictEqual(res.status, 200, 'valid ITN must return 200 so PayFast stops retrying');
  assert.strictEqual(text, 'OK');
  assert.strictEqual(fetchImpl.calls.validate, 1);
  assert.strictEqual(fetchImpl.calls.apply, 1);
  assert.strictEqual(billing.state.subscription.status, 'active');
  assert.strictEqual(billing.state.subscription.extend_count, 1);
  assert.strictEqual(billing.state.subscription.payment_count, 1);
  assert.strictEqual(billing.state.events.length, 1);
}

// --- invalid signature: do not continue ---
{
  const fields = signedFields();
  fields.signature = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const { res, fetchImpl, billing } = await send(fields);
  assert.strictEqual(res.status, 400);
  assert.strictEqual(fetchImpl.calls.validate, 0);
  assert.strictEqual(fetchImpl.calls.apply, 0);
  assert.strictEqual(billing.state.subscription.status, 'payment_pending');
  assert.ok(!verifyItnSignature(fields, PASSPHRASE).ok);
}

// --- wrong amount vs server-side R250 / R2500 ---
{
  const fields = signedFields({ amount_gross: '1.00' });
  fields.signature = generateItnSignature(fields, PASSPHRASE);
  const amountCheck = verifyAmountAgainstServerPrice(fields);
  assert.strictEqual(amountCheck.reason, 'wrong_amount');
  const { res, fetchImpl, billing } = await send(fields);
  assert.strictEqual(res.status, 400);
  assert.strictEqual(fetchImpl.calls.validate, 0, 'wrong amount must not call PayFast validate');
  assert.strictEqual(fetchImpl.calls.apply, 0);
  assert.strictEqual(billing.state.events.length, 0);
}

// --- unknown company / reference ---
{
  const fields = signedFields({ m_payment_id: 'fs-sub-unknown-ref-999', custom_str1: '99999999-9999-4999-8999-999999999999' });
  fields.signature = generateItnSignature(fields, PASSPHRASE);
  const { res, fetchImpl, text } = await send(fields);
  assert.strictEqual(res.status, 400);
  assert.strictEqual(fetchImpl.calls.validate, 1, 'crypto/origin/validate still run');
  assert.strictEqual(fetchImpl.calls.apply, 1);
  assert.strictEqual(text, 'INVALID');
}

// --- duplicate ITN never extends twice ---
{
  const billing = memoryBilling();
  const fields = signedFields();
  const first = await send(fields, { billing: billing });
  const second = await send(fields, { billing: billing });
  assert.strictEqual(first.res.status, 200);
  assert.strictEqual(second.res.status, 200);
  assert.strictEqual(billing.state.subscription.extend_count, 1);
  assert.strictEqual(billing.state.subscription.payment_count, 1);
  assert.strictEqual(billing.state.events.length, 1);
  assert.strictEqual(second.fetchImpl.calls.apply, 1);
}

// --- malformed request ---
{
  const empty = await handlePayfastItn(
    { method: 'POST', headers: headers(), text: async function () { return ''; } },
    { cfg: cfg, knownIps: knownIps, fetch: testFetch(memoryBilling()) }
  );
  assert.strictEqual(empty.status, 400);

  const json = await handlePayfastItn(
    {
      method: 'POST',
      headers: headers({ 'content-type': 'application/json' }),
      text: async function () {
        return '{"payment_status":"COMPLETE"}';
      }
    },
    { cfg: cfg, knownIps: knownIps, fetch: testFetch(memoryBilling()) }
  );
  assert.strictEqual(json.status, 400);

  const get = await handlePayfastItn(
    { method: 'GET', headers: headers(), text: async function () { return ''; } },
    { cfg: cfg, knownIps: knownIps, fetch: testFetch(memoryBilling()) }
  );
  assert.strictEqual(get.status, 405);

  const missing = requiredItnFields({ payment_status: 'COMPLETE' });
  assert.ok(!missing.ok);
  assert.strictEqual(missing.reason, 'malformed');

  assert.throws(function () {
    parseItnFormBody('{%not-form');
  });
}

// --- already processed transaction ---
{
  const billing = memoryBilling();
  const fields = signedFields({ pf_payment_id: 'processed-99' });
  fields.signature = generateItnSignature(fields, PASSPHRASE);
  billing.state.events.push({
    payfast_payment_id: 'processed-99',
    payment_status: 'COMPLETE',
    processed_at: '2026-01-01T00:00:00.000Z',
    company_id: COMPANY_ID,
    amount: 250
  });
  billing.state.subscription.status = 'active';
  billing.state.subscription.payfast_payment_id = 'processed-99';
  billing.state.subscription.extend_count = 1;
  billing.state.subscription.payment_count = 1;
  billing.state.subscription.current_period_end = '2026-10-16T00:00:00.000Z';
  const { res, text } = await send(fields, { billing: billing });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(text, 'OK');
  assert.strictEqual(billing.state.subscription.extend_count, 1);
  assert.strictEqual(billing.state.subscription.payment_count, 1);
  assert.strictEqual(billing.state.events.length, 1);
}

// --- PayFast validate must be exact VALID ---
{
  const { res, fetchImpl, billing } = await send(signedFields(), { validateBody: 'INVALID' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(fetchImpl.calls.apply, 0);
  assert.strictEqual(billing.state.subscription.status, 'payment_pending');
}

{
  const { res, fetchImpl } = await send(signedFields(), { validateBody: 'VALID\nTAMPER' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(fetchImpl.calls.apply, 0);
}

// --- origin must be a PayFast host IP ---
{
  const { res, fetchImpl } = await send(signedFields(), {
    headers: { 'x-forwarded-for': '8.8.8.8' },
    knownIps: [PF_IP]
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(fetchImpl.calls.validate, 0);
  assert.strictEqual(fetchImpl.calls.apply, 0);
}

// --- sanitised logs / payload never include secrets ---
{
  const fields = signedFields();
  const safe = sanitisedItnFields(fields);
  assert.ok(!Object.prototype.hasOwnProperty.call(safe, 'signature'));
  assert.ok(!Object.prototype.hasOwnProperty.call(safe, 'token'));
  const logged = JSON.stringify(logSafeItn(fields, { passphrase: 'secret', merchant_key: 'key', token: 'tok' }));
  assert.ok(logged.indexOf(PASSPHRASE) === -1);
  assert.ok(logged.indexOf('test-sandbox-key') === -1);
  assert.ok(logged.indexOf(fields.signature) === -1);
}

// --- full verifyPayfastItn happy path ---
{
  const verified = await verifyPayfastItn({
    fields: signedFields(),
    cfg: cfg,
    headers: headers(),
    knownIps: knownIps,
    fetch: async function () {
      return { ok: true, text: async function () { return 'VALID'; } };
    }
  });
  assert.ok(verified.ok);
  assert.strictEqual(verified.expected.amountNumber, 250);
  assert.strictEqual(verified.companyId, COMPANY_ID);
}

console.log('payfast-itn.test.mjs: ok');
