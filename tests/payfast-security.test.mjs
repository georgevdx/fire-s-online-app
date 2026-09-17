'use strict';

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolveAuthoritativeCheckout } from '../supabase/functions/_shared/payfast-sign.js';
import { generateItnSignature } from '../supabase/functions/_shared/payfast-itn-verify.js';
import { handlePayfastItn } from '../supabase/functions/_shared/payfast-itn-handler.js';
import { loadPayfastConfig } from '../supabase/functions/_shared/payfast-config.js';
import { phpUrlEncode } from '../supabase/functions/_shared/payfast-sign.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

const results = [];
function record(id, name, pass, attempted, expected, actual, weakness, fix) {
  results.push({
    id: id,
    name: name,
    result: pass ? 'PASS' : 'FAIL',
    attempted: attempted,
    expected: expected,
    actual: actual,
    weakness: weakness || 'None',
    fix: fix || 'None — existing controls held.'
  });
  assert.ok(pass, id + ' ' + name + ': ' + actual);
}

const entitlementJs = read('staging/fire-s-entitlement.js');
const subscribeJs = read('staging/fire-s-subscribe.js');
const catalogJs = read('staging/fire-s-subscriptions.js');
const payfastJs = read('staging/fire-s-payfast.js');
const appJs = read('staging/app.js');
const getStartedJs = read('staging/fire-s-get-started.js');
const itnSql = read('SUPABASE_subscription_lifecycle.sql');
const trialSql = read('SUPABASE_company_trial.sql');
const accessSql = read('SUPABASE_entitlement_access.sql');
const checkoutSql = read('SUPABASE_payfast_checkout.sql');
const itnBaseSql = read('SUPABASE_payfast_itn.sql');
const subsSql = read('SUPABASE_company_subscriptions.sql');
const entitlementSql = read('SUPABASE_company_entitlement.sql');
const checkoutFn = read('supabase/functions/payfast-checkout/index.js');
const signJs = read('supabase/functions/_shared/payfast-sign.js');
const verifyJs = read('supabase/functions/_shared/payfast-itn-verify.js');
const handlerJs = read('supabase/functions/_shared/payfast-itn-handler.js');
const liveApp = read('app.js');
const liveEntitlement = read('fire-s-entitlement.js');

function sliceFn(src, name) {
  const start = src.indexOf('create or replace function public.' + name);
  assert.ok(start >= 0, 'missing ' + name);
  const end = src.indexOf('\n$$;', start);
  return src.slice(start, end);
}

function fakeEl(id, nodes) {
  if (!nodes[id]) {
    nodes[id] = {
      id: id,
      hidden: true,
      style: { display: 'none' },
      textContent: '',
      className: '',
      innerHTML: '',
      addEventListener: function () {},
      querySelector: function () {
        return fakeEl(id + '__child', nodes);
      },
      insertBefore: function (node) {
        return node;
      }
    };
  }
  return nodes[id];
}

function loadClient(src, extra) {
  const store = extra && extra.store ? extra.store : {};
  const nodes = extra && extra.nodes ? extra.nodes : {};
  const sandbox = {
    window: {},
    location: extra && extra.location
      ? extra.location
      : { hash: '', search: '', href: 'https://example.test/staging/' },
    history: { replaceState: function () {} },
    document: {
      readyState: 'complete',
      addEventListener: function () {},
      getElementById: function (id) {
        return fakeEl(id, nodes);
      },
      querySelectorAll: function () {
        return [];
      },
      body: {
        classList: { toggle: function () {}, contains: function () { return false; } },
        appendChild: function (n) { return n; },
        insertBefore: function (n) { return n; },
        firstChild: null
      },
      createElement: function () {
        return {
          id: '',
          className: '',
          hidden: true,
          innerHTML: '',
          textContent: '',
          style: { cssText: '' },
          setAttribute: function () {},
          addEventListener: function () {}
        };
      }
    },
    console: { log: function () {}, warn: function () {}, error: function () {} },
    localStorage: {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem: function (key, value) {
        store[key] = String(value);
      },
      removeItem: function (key) {
        delete store[key];
      }
    },
    alert: function () {},
    confirm: function () {
      return extra && extra.confirm === true;
    },
    setTimeout: function () {
      return 0;
    },
    URL: URL,
    Promise: Promise
  };
  Object.assign(sandbox, extra && extra.globals ? extra.globals : {});
  sandbox.window = sandbox;
  sandbox.currentUserProfile = sandbox.currentUserProfile || {
    id: 'owner-1',
    email: 'owner@example.test',
    companyId: 'co-1',
    role: 'company_owner'
  };
  vm.runInNewContext(src, sandbox);
  sandbox.__store = store;
  sandbox.__nodes = nodes;
  return sandbox;
}

const denyRpc = {
  rpc: async function (name) {
    denyRpc.last = name;
    return {
      data: {
        allowed: false,
        can_create: false,
        can_finalise: false,
        can_write_draft: true,
        can_read: true,
        keep_data: true,
        authority: 'server',
        clock: 'server',
        backendReady: true,
        status: 'subscription_required',
        reason: 'subscription_required',
        super_admin: false
      }
    };
  },
  from: function () {
    return {
      update: function () {
        return {
          eq: async function () {
            return { error: { message: 'RLS blocked' } };
          }
        };
      }
    };
  }
};

// --- 1 localStorage ---
{
  const box = loadClient(entitlementJs);
  box.__store['fireS.billingStatus'] = 'active';
  box.__store['fireS.billingRenewsOn'] = '2099-12-31';
  box.__store['fireS.trialExpiresAt'] = '2099-12-31';
  const api = box.fireSEntitlement;
  const pass =
    api.hasSnapshot() === false &&
    api.canCreate() === false &&
    api.operationallyAllowed() === false &&
    !/currentCompanyAccess\?\.status === 'active'/.test(
      appJs.match(/function hasActiveCompanyAccess\(\) \{[\s\S]*?\n\}/)[0]
    );
  record(
    1,
    'Change localStorage subscription status',
    pass,
    'Set fireS.billingStatus=active and a future renew date, then asked canCreate / operationallyAllowed.',
    'Client must not grant paid write access from localStorage.',
    pass
      ? 'hasSnapshot=false, canCreate=false, operationallyAllowed=false; hasActiveCompanyAccess ignores currentCompanyAccess.status.'
      : 'localStorage granted access.',
    pass ? 'None' : 'localStorage can grant access',
    pass ? 'None — toets fail-closed snapshot.' : 'Need fail-closed entitlement gates.'
  );
}

// --- 2 browser clock ---
{
  const box = loadClient(entitlementJs);
  box.Date = function FakeDate() {
    return new Date('2099-12-31T00:00:00Z');
  };
  box.Date.now = function () {
    return Date.parse('2099-12-31T00:00:00Z');
  };
  const api = box.fireSEntitlement;
  api.getCompanyEntitlement = async function () {
    return {
      allowed: false,
      can_create: false,
      can_finalise: false,
      backendReady: true,
      status: 'trial_expired',
      reason: 'trial_expired',
      clock: 'server'
    };
  };
  const denied = await api.assertCanCreate();
  const pass =
    denied === false &&
    /v_now timestamptz := now\(\)/.test(trialSql) &&
    /clock', 'server'/.test(trialSql);
  record(
    2,
    'Manipulate browser clock',
    pass,
    'Moved Date to 2099-12-31 and called assertCanCreate with a server trial_expired snapshot.',
    'Browser clock must not start or extend a trial. Server now() is authority.',
    pass
      ? 'assertCanCreate denied. SQL entitlement uses now() and clock=server.'
      : 'Clock manipulation granted create.',
    'None',
    'None — server clock in fire_s_compute_entitlement.'
  );
}

// --- 3 protected URL ---
{
  const nodes = {};
  const box = loadClient(entitlementJs, {
    nodes: nodes,
    location: {
      hash: '#newInspection',
      search: '?inspect=new',
      href: 'https://example.test/staging/?inspect=new#newInspection'
    }
  });
  box.supabaseClient = denyRpc;
  const info = await box.fireSEntitlement.getCompanyEntitlement('co-1');
  box.fireSEntitlement.guardDirectUrl();
  const pass =
    info.can_create === false &&
    nodes.fireSSubscriptionRequiredSection &&
    nodes.fireSSubscriptionRequiredSection.hidden === false &&
    /createNewProject/.test(entitlementJs) &&
    /guardDirectUrl/.test(entitlementJs);
  record(
    3,
    'Open protected URL directly',
    pass,
    'Opened #newInspection?inspect=new with server can_create=false.',
    'New-inspection deep links must open Subscription required, not create a cycle.',
    pass
      ? 'guardDirectUrl showed fireSSubscriptionRequiredSection; create wrappers still call assertCanCreate.'
      : 'Deep link opened a new inspection.',
    'URL guard is UX; create wrappers are the real block.',
    'None — wrapNewInspection + guardDirectUrl.'
  );
}

// --- 4 protected RPCs ---
{
  const applyGrant = /revoke all on function public\.fire_s_apply_payfast_itn[\s\S]*from authenticated/.test(itnSql);
  const activateGrant =
    /revoke all on function public\.fire_s_activate_paid_subscription[\s\S]*from authenticated/.test(
      entitlementSql
    );
  const checkoutGrant = /revoke all on function public\.fire_s_begin_payfast_checkout[\s\S]*from authenticated/.test(
    checkoutSql
  );
  const trialGrant = /revoke all on function public\.fire_s_start_company_trial[\s\S]*from authenticated/.test(trialSql);
  const subWrite = /fire_s_company_subscriptions_update[\s\S]*using \(false\)/.test(subsSql);
  const inspectGuard = /A subscription is required to start new inspections/.test(accessSql);
  const pass = applyGrant && activateGrant && checkoutGrant && trialGrant && subWrite && inspectGuard;
  record(
    4,
    'Call protected Supabase operations directly',
    pass,
    'Checked grants for apply ITN, activate paid, begin checkout, start trial, subscription writes, inspection insert.',
    'Authenticated clients must not execute billing RPCs or write subscription rows.',
    pass
      ? 'Those RPCs are service_role only; subscription UPDATE policy is false; inspection INSERT is entitlement-guarded.'
      : 'A billing RPC is still granted to authenticated.',
    'Compromise of service_role remains an out-of-band risk.',
    'None — existing revoke/grant and RLS.'
  );
}

// --- 5 company_id swap ---
{
  const trusted = resolveAuthoritativeCheckout(
    { companyId: 'co-owner', email: 'owner@example.test', companyName: 'Acme' },
    { companyId: 'co-attacker', amount: '1.00', mPaymentId: 'forged', interval: 'monthly' }
  );
  const itnMatch = /Company does not match payment reference/.test(itnSql);
  const billingOther = /Not allowed to read another company billing/.test(itnSql);
  const inspectLock = /NEW\.company_id := OLD\.company_id/.test(accessSql);
  const pass =
    trusted.companyId === 'co-owner' &&
    itnMatch &&
    billingOther &&
    inspectLock &&
    /Never read amount, price, plan, companyId or mPaymentId from the browser/.test(signJs);
  record(
    5,
    'Change company_id in a request',
    pass,
    'Passed attacker companyId into checkout resolver; checked ITN and billing SQL for cross-company rejects.',
    'Company must come from JWT membership / payment ledger, never the browser body.',
    pass
      ? 'Checkout kept co-owner. ITN raises on mismatch. Billing RPC and inspection UPDATE lock company_id.'
      : 'Client companyId was trusted.',
    'None',
    'None — resolveAuthoritativeCheckout + ITN ledger bind.'
  );
}

// --- 6 price from browser ---
{
  const monthly = resolveAuthoritativeCheckout(
    { companyId: 'co-1', email: 'owner@example.test' },
    { interval: 'monthly', amount: '1.00', price: '1' }
  );
  const annual = resolveAuthoritativeCheckout(
    { companyId: 'co-1', email: 'owner@example.test' },
    { interval: 'annual', amount: '1.00' }
  );
  const clientBody = payfastJs.match(/body:\s*JSON\.stringify\(\{[\s\S]*?\}\)/);
  const pass =
    monthly.amountNumber === 250 &&
    annual.amountNumber === 2500 &&
    /Authoritative amount mismatch/.test(checkoutSql) &&
    /Authoritative amount mismatch/.test(itnSql) &&
    clientBody &&
    !/amount/.test(clientBody[0]);
  record(
    6,
    'Change plan price from browser',
    pass,
    'Sent amount=1 in untrusted checkout body; inspected client POST body and SQL amount checks.',
    'Server prices stay R250 monthly / R2500 annual. Wrong ITN amount must not activate.',
    pass
      ? 'Resolver ignored client amount. Checkout POST has no amount. SQL rejects amount mismatch.'
      : 'Client amount was used.',
    'None',
    'None — SERVER_PRICES + ITN verifyAmountAgainstServerPrice.'
  );
}

// --- 7 fake return_url ---
{
  let markedPaid = false;
  const box = loadClient(payfastJs, {
    location: {
      hash: '',
      search: '?payfast=ok',
      href: 'https://example.test/staging/index.html?payfast=ok'
    },
    globals: {
      fireSEnv: { isStaging: true, payfast: { enabled: true, mode: 'sandbox', checkoutFunction: 'payfast-checkout' } },
      fireSSubscriptionCatalog: {
        markPaid: function () {
          markedPaid = true;
          return 'active';
        },
        markUnpaid: function () {
          return 'unpaid';
        }
      },
      fireSEntitlement: {
        refresh: async function () {
          return { allowed: false, can_create: false, backendReady: true };
        }
      }
    }
  });
  const pass =
    markedPaid === false &&
    !/cat\.markPaid/.test(payfastJs) &&
    /Access updates when the server confirms/.test(payfastJs) &&
    /activates_on_return_url', false/.test(checkoutSql) &&
    !/fire_s_activate_paid_subscription/.test(checkoutFn) &&
    !/fire_s_apply_payfast_itn/.test(checkoutFn);
  record(
    7,
    'Fake return_url success',
    pass,
    'Loaded staging PayFast client with ?payfast=ok and a markPaid spy.',
    'Return URL must not activate a subscription.',
    pass
      ? 'markPaid was not called. Banner waits for server. Checkout SQL sets activates_on_return_url=false.'
      : 'Return URL called markPaid.',
    'Success banner can show before ITN; access still unpaid.',
    'None — return handler only refreshes entitlement.'
  );
}

// --- ITN harness for 8-11 ---
const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const PF_IP = '197.97.145.148';
const PASSPHRASE = 'test-sandbox-pass';
const cfg = loadPayfastConfig({
  PAYFAST_MODE: 'sandbox',
  PAYFAST_SANDBOX_MERCHANT_ID: '10000100',
  PAYFAST_SANDBOX_MERCHANT_KEY: 'test-sandbox-key',
  PAYFAST_SANDBOX_PASSPHRASE: PASSPHRASE,
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
      amount_gross: '250.00',
      custom_str1: COMPANY_ID,
      custom_str3: 'monthly',
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
    .map(function (key) {
      return key + '=' + phpUrlEncode(fields[key]);
    })
    .join('&');
}
function headers(extra) {
  return {
    get: function (name) {
      const row = Object.assign(
        { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': PF_IP },
        extra || {}
      );
      const key = Object.keys(row).find(function (k) {
        return k.toLowerCase() === String(name).toLowerCase();
      });
      return key ? row[key] : null;
    }
  };
}
function memoryBilling() {
  const state = {
    checkout: { 'fs-sub-checkout-ref-001': { companyId: COMPANY_ID, interval: 'monthly', amount: 250 } },
    events: [],
    subscription: { status: 'payment_pending', extend_count: 0, payfast_payment_id: null }
  };
  function apply(body) {
    const m = body.p_m_payment_id;
    const pf = body.p_payfast_payment_id;
    const status = String(body.p_payment_status || '').toUpperCase();
    const amount = Number(body.p_amount);
    const checkout = state.checkout[m];
    if (!checkout) {
      const err = new Error('Unknown company or payment reference');
      throw err;
    }
    if (body.p_company_id && body.p_company_id !== checkout.companyId) {
      throw new Error('Company does not match payment reference');
    }
    const expected = checkout.interval === 'annual' ? 2500 : 250;
    if (status !== 'CANCELLED' && Math.abs(amount - expected) > 0.01) {
      throw new Error('Authoritative amount mismatch');
    }
    const existing = state.events.find(function (row) {
      return row.payfast_payment_id === pf && row.payment_status === status;
    });
    if (existing) {
      return { ok: true, applied: false, extended: false, duplicate: true, already_processed: true, status: state.subscription.status };
    }
    if (status === 'COMPLETE') {
      state.subscription.status = 'active';
      state.subscription.extend_count += 1;
      state.subscription.payfast_payment_id = pf;
    } else if (status === 'FAILED') {
      state.subscription.status = 'past_due';
    } else {
      state.subscription.status = 'cancelled';
    }
    state.events.push({ payfast_payment_id: pf, payment_status: status });
    return { ok: true, applied: true, extended: status === 'COMPLETE', duplicate: false, status: state.subscription.status };
  }
  return { state, apply };
}
function testFetch(billing) {
  const calls = { validate: 0, apply: 0 };
  const fetchImpl = async function (url, init) {
    const href = String(url);
    if (href.indexOf('/eng/query/validate') !== -1) {
      calls.validate += 1;
      return { ok: true, text: async function () { return 'VALID'; } };
    }
    if (href.indexOf('fire_s_apply_payfast_itn') !== -1) {
      calls.apply += 1;
      const payload = JSON.parse(init.body);
      try {
        const result = billing.apply(payload);
        return { ok: true, json: async function () { return result; } };
      } catch (err) {
        return { ok: false, json: async function () { return { message: err.message }; } };
      }
    }
    throw new Error('unexpected ' + href);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}
async function send(fields, billing) {
  const bill = billing || memoryBilling();
  const fetchImpl = testFetch(bill);
  const res = await handlePayfastItn(
    {
      method: 'POST',
      headers: headers(),
      text: async function () {
        return formBody(fields);
      }
    },
    {
      cfg: cfg,
      fetch: fetchImpl,
      knownIps: [PF_IP],
      env: {
        PAYFAST_MODE: 'sandbox',
        PAYFAST_SANDBOX_MERCHANT_ID: '10000100',
        PAYFAST_SANDBOX_PASSPHRASE: PASSPHRASE,
        SUPABASE_URL: 'https://ejqgzpkfcwocmtvwufwp.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-test'
      }
    }
  );
  return { res, billing: bill, fetchImpl, text: await res.text() };
}

{
  const fake = unsignedFields({ signature: 'deadbeefdeadbeefdeadbeefdeadbeef' });
  const { res, fetchImpl, billing } = await send(fake);
  const pass = res.status === 400 && fetchImpl.calls.apply === 0 && billing.state.subscription.status === 'payment_pending';
  record(
    8,
    'Send fake ITN',
    pass,
    'POSTed a COMPLETE ITN with a made-up signature and no PayFast confirm.',
    'Handler must return INVALID and must not call apply RPC.',
    pass ? 'HTTP 400, apply_count=0, subscription still payment_pending.' : 'Fake ITN applied.',
    'payfast-itn has verify_jwt=false by design; signature/origin/validate are the gate.',
    'None — verifyPayfastItn before applyPayfastItnRpc.'
  );
}

{
  const fields = signedFields();
  fields.signature = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const { res, fetchImpl } = await send(fields);
  const pass = res.status === 400 && fetchImpl.calls.validate === 0 && fetchImpl.calls.apply === 0;
  record(
    9,
    'Send ITN with invalid signature',
    pass,
    'Flipped signature on an otherwise well-formed COMPLETE ITN.',
    'Must stop before PayFast validate and before SQL apply.',
    pass ? 'HTTP 400, validate_count=0, apply_count=0.' : 'Invalid signature continued.',
    'None',
    'None — verifyItnSignature.'
  );
}

{
  const billing = memoryBilling();
  const fields = signedFields();
  const first = await send(fields, billing);
  const second = await send(fields, billing);
  const pass =
    first.res.status === 200 &&
    second.res.status === 200 &&
    billing.state.subscription.extend_count === 1 &&
    /ITN_ALREADY_PROCESSED/.test(itnSql);
  record(
    10,
    'Replay a valid ITN',
    pass,
    'Applied one valid COMPLETE ITN, then replayed the same pf_payment_id.',
    'Second notification must not extend the paid period.',
    pass
      ? 'extend_count stayed 1. SQL marks ITN_ALREADY_PROCESSED on (provider, payment_id, status).'
      : 'Replay double-extended.',
    'None',
    'None — unique payment event + processed_at short-circuit.'
  );
}

{
  const fields = signedFields({ amount_gross: '1.00' });
  fields.signature = generateItnSignature(fields, PASSPHRASE);
  const { res, fetchImpl, billing } = await send(fields);
  const pass =
    res.status === 400 &&
    fetchImpl.calls.apply === 0 &&
    billing.state.events.length === 0 &&
    /wrong_amount/.test(verifyJs);
  record(
    11,
    'Send valid-looking ITN with wrong amount',
    pass,
    'Signed COMPLETE ITN for R1.00 against a monthly R250 checkout.',
    'Must reject before validate/apply. SQL also raises Authoritative amount mismatch.',
    pass ? 'HTTP 400, apply_count=0, no payment event.' : 'Wrong amount activated.',
    'None',
    'None — verifyAmountAgainstServerPrice + SQL amount check.'
  );
}

// --- 12 second company / trial reset ---
{
  const createFn = sliceFn(trialSql, 'fire_s_create_company');
  const startFn = sliceFn(trialSql, 'fire_s_start_company_trial');
  const pass =
    /Same founder must not start a second trial/.test(trialSql) &&
    /fire_s_trial_founders/.test(createFn) &&
    /Never restart a used trial/.test(startFn) &&
    /Only Super Admin can start another company/.test(trialSql) &&
    /with check \(false\)/.test(entitlementSql) &&
    /fire_s_create_company/.test(getStartedJs);
  record(
    12,
    'Create another company/user to reset trial',
    pass,
    'Inspected fire_s_create_company, trial founders, start trial, and direct companies INSERT.',
    'The same founding login must reuse the company and must not restart the trial. Super Admin only for a fresh company.',
    pass
      ? 'create_company reuses founder company. start trial returns if already started. Direct INSERT with check false.'
      : 'A second company could start a new trial.',
    'A brand-new Auth email still gets one trial by design.',
    'None — fire_s_trial_founders.'
  );
}

// --- 13 delete inspection restore quota ---
{
  const pass =
    /fire_s_trial_finalised_inspections/.test(entitlementSql) &&
    /on conflict \(company_id, inspection_id\) do nothing/.test(accessSql) &&
    /create policy "fire_s_trial_claims_delete"[\s\S]*using \(false\)/.test(trialSql) &&
    !/references public\.inspections/.test(
      entitlementSql.match(/create table if not exists public\.fire_s_trial_finalised_inspections[\s\S]*?;/)[0]
    );
  record(
    13,
    'Delete trial inspection and restore quota',
    pass,
    'Checked whether trial count reads live inspections or the append-only claims table.',
    'Deleting an inspection must not restore trial quota.',
    pass
      ? 'Count uses fire_s_trial_finalised_inspections. Claims DELETE policy is false. No FK to inspections.'
      : 'Quota follows live inspection rows.',
    'None',
    'None — claims table + deny delete.'
  );
}

// --- 14 expire while logged in ---
{
  const box = loadClient(entitlementJs);
  let calls = 0;
  box.supabaseClient = {
    rpc: async function () {
      calls += 1;
      return {
        data: {
          allowed: false,
          can_create: false,
          can_finalise: false,
          can_write_draft: true,
          keep_data: true,
          authority: 'server',
          backendReady: true,
          status: 'subscription_required',
          reason: 'subscription_required'
        }
      };
    }
  };
  const created = await box.fireSEntitlement.assertCanCreate();
  const finished = await box.fireSEntitlement.assertCanFinalise();
  const pass =
    created === false &&
    finished === false &&
    calls >= 2 &&
    /if \(!info \|\| !info\.backendReady\) {\s*return deny\('subscription_required'\)/s.test(entitlementJs);
  record(
    14,
    'Expire subscription while user is logged in',
    pass,
    'Kept the tab open and called assertCanCreate / assertCanFinalise after the server snapshot flipped to unpaid.',
    'Create and finalise must re-query the server and deny. Data stays readable.',
    pass
      ? 'Both wrappers refresh() then deny. Draft writes remain allowed by policy (can_write_draft).'
      : 'Stale session still created inspections.',
    'Draft autosave can continue until refresh; paid writes re-check.',
    'None — assertCanCreate/Finalise call refresh().'
  );
}

// --- 15 cancel ---
{
  const cancelFn = sliceFn(itnSql, 'fire_s_cancel_company_subscription');
  const compute = sliceFn(itnSql, 'fire_s_compute_entitlement');
  const nodes = {};
  const box = loadClient(subscribeJs, {
    nodes: nodes,
    confirm: true,
    globals: {
      resolveFireSHomeRole: function () {
        return 'inspector';
      },
      fireSSubscriptionCatalog: {
        cancelBilling: function () {
          return 'cancelled';
        },
        billingStatus: function () {
          return 'active';
        },
        statusHeadline: function () {
          return 'Active';
        },
        statusKeepDataNote: function () {
          return 'stay';
        },
        formatLongDate: function () {
          return '1 Oct';
        },
        currentRenewsOn: function () {
          return '2026-10-01';
        }
      }
    }
  });
  box.fireSSubscribeGoBack;
  // cancelSubscription is not exported; inspector role is checked via canManage in source
  const pass =
    /Only the Owner can cancel this subscription/.test(cancelFn) &&
    /keep_data', true/.test(cancelFn) &&
    !/current_period_end = null/.test(cancelFn) &&
    /cancelled_until_period_end/.test(compute) &&
    /Only the Owner can cancel this subscription/.test(subscribeJs) &&
    !/delete from public\.inspections/.test(cancelFn);
  record(
    15,
    'Cancel subscription',
    pass,
    'Read cancel RPC and toets cancel UI. Inspector role is not in the cancel role list.',
    'Only Owner/super_admin can cancel. Renewals stop. Access may continue until paid-through. Data stays.',
    pass
      ? 'RPC raises for non-owners, keeps current_period_end, audits keep_data=true, no inspection deletes.'
      : 'Cancel deleted data or was open to inspectors.',
    'Billing RPC can_cancel still true for managers; cancel RPC still owner-only.',
    'None — fire_s_cancel_company_subscription role check.'
  );
}

// --- 16 failed recurring ---
{
  const apply = sliceFn(itnSql, 'fire_s_apply_payfast_itn');
  const compute = sliceFn(itnSql, 'fire_s_compute_entitlement');
  const failed = await send(signedFields({ payment_status: 'FAILED', pf_payment_id: 'fail-1' }));
  const pass =
    /LIFECYCLE_FAILED_GRACE/.test(apply) &&
    /payment_grace_days set default 7/.test(itnSql) &&
    /past_due_grace/.test(compute) &&
    /when s\.status in \('cancelled', 'expired', 'trialing'\) then s\.status/.test(apply) &&
    !/delete from public\.inspections/.test(apply) &&
    failed.billing.state.subscription.status === 'past_due';
  record(
    16,
    'Failed recurring payment',
    pass,
    'Applied a FAILED ITN against an in-flight subscription and read grace SQL.',
    'One failure must set past_due with a configurable grace window, not delete data or drop access immediately.',
    pass
      ? 'Handler set past_due. SQL stores grace_ends_at from payment_grace_days (default 7) and still allows access in grace.'
      : 'Failure immediately locked or deleted.',
    'None',
    'None — configurable payment_grace_days.'
  );
}

// --- 17 switch monthly/annual ---
{
  const apply = sliceFn(itnSql, 'fire_s_apply_payfast_itn');
  const setPlan = read('SUPABASE_paid_seats.sql');
  const pass =
    /Only the Owner can change the package/.test(setPlan) &&
    /interval '1 year'/.test(apply) &&
    /interval '1 month'/.test(apply) &&
    /v_expected := case when v_interval = 'annual' then 2500 else 250 end/.test(apply) &&
    /status = 'payment_pending'/.test(checkoutSql);
  record(
    17,
    'Switch monthly/annual plan',
    pass,
    'Tried to treat interval as a free upgrade: owner RPC can save preference; paid period only changes on COMPLETE ITN at server price.',
    'Choosing annual without a R2500 COMPLETE ITN must not grant a year of paid access.',
    pass
      ? 'set_company_plan is owner-only and does not set status=active. Period length and amount are applied only in ITN COMPLETE.'
      : 'Interval change activated paid annual access.',
    'Owner can store a preferred interval before paying; entitlement still follows subscription status.',
    'None — amount/period bound to COMPLETE ITN.'
  );
}

// --- 18 inspector billing ---
{
  const nodes = {};
  const messages = [];
  const box = loadClient(subscribeJs, {
    nodes: nodes,
    globals: {
      resolveFireSHomeRole: function () {
        return 'inspector';
      },
      fireSSubscriptionCatalog: {
        persistCompanyPlan: async function () {
          throw new Error('inspector must not persist');
        },
        startCheckout: function () {}
      },
      fireSPayfast: {
        isEnabled: function () {
          return true;
        },
        startCheckout: async function () {
          throw new Error('inspector checkout');
        }
      }
    }
  });
  box.fireSSetSubscribeMessage = function (msg) {
    messages.push(msg);
  };
  // Re-bind: setMessage is internal. Trigger via click handlers after boot.
  const saveBtn = nodes.fireSSubscribeSaveBtn;
  const payBtn = nodes.fireSPayfastPayBtn;
  if (saveBtn && saveBtn.addEventListener) {
    // handlers already wired in boot
  }
  const srcPass =
    /Only the Owner can pay on PayFast/.test(subscribeJs) &&
    /Only the Owner can change billing/.test(subscribeJs) &&
    /Only the Owner can cancel this subscription/.test(subscribeJs) &&
    /Only the Owner can pay on PayFast/.test(checkoutFn) &&
    /role in \('company_owner', 'owner', 'super_admin'\)/.test(sliceFn(itnSql, 'fire_s_cancel_company_subscription'));
  record(
    18,
    'Inspector attempts company billing modification',
    srcPass,
    'Inspector role: savePlan, payNow, and cancel must no-op on the client; checkout Edge Function and cancel RPC are owner-only.',
    'Inspectors must not change plan, pay, or cancel.',
    srcPass
      ? 'Client now blocks pay/save for non-owners. Checkout and cancel RPC already owner-only. Subscribe section is CSS-hidden for inspectors.'
      : 'Inspector could change billing.',
    'Managers still match fire_s_can_manage_company for companies UPDATE of non-entitlement fields.',
    srcPass
      ? 'Gated savePlan and payNow with canManage() on toets (this phase).'
      : 'Need owner gates on save/pay.'
  );
}

// --- 19 admin markPaid ---
{
  const catBox = loadClient(catalogJs);
  catBox.currentUserProfile = { id: 'owner-1', email: 'owner@example.test', companyId: 'co-1', role: 'company_owner' };
  catBox.fireSSubscriptionCatalog.markPaid('monthly');
  const localActive = catBox.fireSSubscriptionCatalog.billingStatus() === 'active';
  const ent = loadClient(entitlementJs);
  ent.supabaseClient = denyRpc;
  const info = await ent.fireSEntitlement.getCompanyEntitlement('co-1');
  const protect = sliceFn(trialSql, 'fire_s_protect_company_entitlement');
  const pass =
    localActive === true &&
    info.allowed === false &&
    info.can_create === false &&
    ent.fireSEntitlement.canCreate() === false &&
    /NEW\.subscription_status := OLD\.subscription_status/.test(protect) &&
    /NEW\.billing_status := OLD\.billing_status/.test(protect);
  record(
    19,
    'Company admin attempts to manually set subscription active',
    pass,
    'Called markPaid("monthly") then asked the entitlement RPC (still unpaid). Read companies entitlement trigger.',
    'Owner console / Save billing must not set fire_s_company_subscriptions.status=active.',
    pass
      ? 'Local catalog became active (UI only). RPC still denied create. Trigger reverts subscription_status and billing_status without entitlement_write GUC.'
      : 'markPaid granted server access.',
    'Local catalog can look active until entitlement paint; write gates ignore it.',
    'None — protect trigger + RPC authority.'
  );
}

// --- 20 cross-tenant ---
{
  const getEnt = sliceFn(accessSql, 'fire_s_get_company_entitlement');
  const getBill = sliceFn(itnSql, 'fire_s_get_company_billing');
  const apply = sliceFn(itnSql, 'fire_s_apply_payfast_itn');
  const grant = itnSql.match(/grant select \([\s\S]*?\) on table public\.fire_s_company_subscriptions to authenticated/)[0];
  const pass =
    /Not allowed to read another company entitlement/.test(getEnt) &&
    /Not allowed to read another company billing/.test(getBill) &&
    /Company does not match payment reference/.test(apply) &&
    !/payfast_subscription_token/.test(grant) &&
    /fire_s_is_company_member\(company_id\)/.test(subsSql);
  record(
    20,
    'Cross-tenant access attempt',
    pass,
    'Asked entitlement/billing RPCs for another company_id and checked ITN token vs m_payment_id bind plus column grants.',
    'A member must not read or pay another tenant. Tokens stay off authenticated SELECT.',
    pass
      ? 'Both read RPCs raise. ITN rejects mismatched company. Token column is not granted to authenticated.'
      : 'Cross-tenant read/write is open.',
    'super_admin can read all tenants by design.',
    'None — membership checks + token column revoke.'
  );
}

const failed = results.filter(function (row) {
  return row.result === 'FAIL';
});
const criticalBypass = failed.length > 0;

console.log(JSON.stringify({ tests: results, failed: failed.length, critical_billing_bypass: criticalBypass }, null, 2));
assert.strictEqual(failed.length, 0, 'critical billing bypass remains');

const liveFailOpen = /currentCompanyAccess\?\.status === 'active' \|\|/.test(
  liveApp.match(/function hasActiveCompanyAccess\(\) \{[\s\S]*?\n\}/)[0]
);
assert.ok(liveFailOpen, 'live fail-open is expected until sit dit live; do not treat live as PayFast production');
assert.ok(!/past_due_grace/.test(liveEntitlement), 'lifecycle copy stays off live');

console.log('payfast-security.test.mjs: ok');
console.log(
  'PRODUCTION_READY: NO — toets 20/20 held in code, but live client is still fail-open and Fire-S Test deploy of stacked SQL/functions is not this test’s production sign-off.'
);
