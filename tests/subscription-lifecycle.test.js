'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function sliceFn(src, name) {
  const start = src.indexOf('create or replace function public.' + name);
  assert.ok(start >= 0, 'missing function ' + name);
  const end = src.indexOf('\n$$;', start);
  assert.ok(end > start, 'unterminated function ' + name);
  return src.slice(start, end);
}

const sql = read('SUPABASE_subscription_lifecycle.sql');
const migration = read('supabase/migrations/20260917150000_fire_s_subscription_lifecycle.sql');
const stagingHtml = read('staging/index.html');
const stagingCss = read('staging/fire-s-subscribe.css');
const stagingSubscribe = read('staging/fire-s-subscribe.js');
const stagingEntitlement = read('staging/fire-s-entitlement.js');
const liveHtml = read('index.html');
const liveSubscribe = read('fire-s-subscribe.js');
const liveEntitlement = read('fire-s-entitlement.js');

assert.strictEqual(sql, migration, 'SQL Editor copy must match the migration');

assert.ok(/payment_grace_days integer/.test(sql));
assert.ok(/payment_grace_days set default 7/.test(sql));
assert.ok(/cancel_keeps_access_until_paid_through boolean/.test(sql));
assert.ok(/cancel_keeps_access_until_paid_through set default false/.test(sql));
assert.ok(/One row, not scattered in app code/.test(sql));
assert.ok(/grace_ends_at timestamptz/.test(sql));
assert.ok(/last_payment_failed_at timestamptz/.test(sql));
assert.ok(/fire_s_payment_grace_days\(\)/.test(sql));
assert.ok(/fire_s_cancel_keeps_access\(\)/.test(sql));
assert.ok(/fire_s_subscription_access_until/.test(sql));
assert.ok(/fire_s_get_company_billing/.test(sql));

const compute = sliceFn(sql, 'fire_s_compute_entitlement');
assert.ok(/past_due_grace/.test(compute));
assert.ok(/cancelled_until_period_end/.test(compute));
assert.ok(/v_sub_status = 'cancelled'/.test(compute));
assert.ok(/in_grace/.test(compute));
assert.ok(/access_until/.test(compute));
assert.ok(/keep_data', true/.test(compute) || /'keep_data', true/.test(compute));
assert.ok(/'can_read', v_can_read/.test(compute));
assert.ok(/'can_export', v_can_export/.test(compute));
assert.ok(!/'can_read', true/.test(compute), 'cancelled companies must not always receive can_read');
assert.ok(!/delete from public\.inspections/.test(compute));

const apply = sliceFn(sql, 'fire_s_apply_payfast_itn');
assert.ok(/LIFECYCLE_INITIAL/.test(apply));
assert.ok(/LIFECYCLE_RECURRING/.test(apply));
assert.ok(/LIFECYCLE_REACTIVATE/.test(apply));
assert.ok(/LIFECYCLE_FAILED_GRACE/.test(apply));
assert.ok(/LIFECYCLE_CANCELLED/.test(apply));
assert.ok(/LIFECYCLE_TOKEN_CHANGED/.test(apply));
assert.ok(/ITN_ALREADY_PROCESSED/.test(apply));
assert.ok(/already_processed/.test(apply));
assert.ok(/duplicate/.test(apply));
assert.ok(/for update/i.test(apply));
assert.ok(/interval '1 year'/.test(apply));
assert.ok(/interval '1 month'/.test(apply));
assert.ok(/v_from_status in \('cancelled', 'expired'\) then 'LIFECYCLE_REACTIVATE'/.test(apply));
assert.ok(/v_from_status in \('active', 'past_due'\)/.test(apply));
assert.ok(/when s\.status in \('cancelled', 'expired', 'trialing'\) then s\.status/.test(apply));
assert.ok(/else 'past_due'/.test(apply));
assert.ok(/make_interval\(days => v_grace\)/.test(apply));
assert.ok(/coalesce\(\s*s\.grace_ends_at,/s.test(apply), 'in-flight grace must stay put if config later changes');
assert.ok(!/current_period_end = null/.test(apply));
assert.ok(!/last_payment_at = null/.test(apply));
assert.ok(!/delete from public\.inspections/.test(apply));
assert.ok(/deleted_inspections', false/.test(apply) || /'deleted_inspections', false/.test(apply));
assert.ok(/keep_data', true/.test(apply) || /'keep_data', true/.test(apply));
assert.ok(/token_changed/.test(apply));
assert.ok(/unique_violation/.test(apply));

const cancelFn = sliceFn(sql, 'fire_s_cancel_company_subscription');
assert.ok(/status = 'cancelled'/.test(cancelFn));
assert.ok(/next_billing_at = null/.test(cancelFn));
assert.ok(!/current_period_end = null/.test(cancelFn), 'cancel must keep paid-through');
assert.ok(/LIFECYCLE_CANCELLED/.test(cancelFn));
assert.ok(/cancel_keeps_access_until_paid_through/.test(cancelFn));
assert.ok(/keep_data', true/.test(cancelFn) || /'keep_data', true/.test(cancelFn));
assert.ok(!/delete from public\.inspections/.test(cancelFn));

const billingFn = sliceFn(sql, 'fire_s_get_company_billing');
[
  'plan',
  'billing_interval',
  'subscription_status',
  'trial_ends_at',
  'paid_through',
  'next_billing_at',
  'last_successful_payment_at',
  'grace_ends_at',
  'can_subscribe',
  'can_cancel'
].forEach(function (key) {
  assert.ok(billingFn.indexOf("'" + key + "'") !== -1, 'billing RPC must return ' + key);
});
assert.ok(!/payfast_subscription_token/.test(billingFn));
assert.ok(!/merchant_key/.test(billingFn));
assert.ok(!/passphrase/.test(billingFn));
assert.ok(!/last_failed_payment_id/.test(billingFn));
assert.ok(!/PAYFAST_/.test(billingFn));
assert.ok(/Never returns PayFast tokens or secrets/.test(sql));

assert.ok(/revoke select on table public\.fire_s_company_subscriptions from authenticated/.test(sql));
assert.ok(/grant select \(/.test(sql));
assert.ok(!/payfast_subscription_token/.test(sql.match(/grant select \([\s\S]*?\) on table public\.fire_s_company_subscriptions to authenticated/)[0]));
assert.ok(!/payfast_payment_id/.test(sql.match(/grant select \([\s\S]*?\) on table public\.fire_s_company_subscriptions to authenticated/)[0]));
assert.ok(/revoke all on function public\.fire_s_apply_payfast_itn[\s\S]*from authenticated/.test(sql));
assert.ok(/grant execute on function public\.fire_s_apply_payfast_itn[\s\S]*to service_role/.test(sql));
assert.ok(/grant execute on function public\.fire_s_get_company_billing\(uuid\) to authenticated/.test(sql));

const billingPage = stagingHtml.match(/id="fireSCompanyBillingPanel"[\s\S]*?<\/section>/)[0];
assert.ok(/Company billing/.test(billingPage));
assert.ok(/id="fireSBillingPlan"/.test(billingPage));
assert.ok(/Billing interval/.test(billingPage) && /id="fireSBillingInterval"/.test(billingPage));
assert.ok(/Subscription status/.test(billingPage) && /id="fireSBillingStatus"/.test(billingPage));
assert.ok(/Trial expiry/.test(billingPage) && /id="fireSBillingTrial"/.test(billingPage));
assert.ok(/Paid through/.test(billingPage) && /id="fireSBillingPaidThrough"/.test(billingPage));
assert.ok(/Next billing/.test(billingPage) && /id="fireSBillingNext"/.test(billingPage));
assert.ok(/Last successful payment/.test(billingPage) && /id="fireSBillingLastPaid"/.test(billingPage));
assert.ok(/id="fireSBillingSubscribeBtn"/.test(stagingHtml) && /Subscribe \/ Reactivate/.test(stagingHtml));
assert.ok(/Cancel subscription/.test(billingPage));
assert.ok(/A failed payment does not delete company data/.test(billingPage));
assert.ok(!/merchant_key/.test(billingPage));
assert.ok(!/passphrase/.test(billingPage));
assert.ok(!/token/.test(billingPage));
assert.ok(!/PAYFAST_/.test(billingPage));

assert.ok(/id="fireSCompanyBillingPanel"/.test(stagingHtml));
assert.ok(!/id="fireSCompanyBillingPanel"/.test(liveHtml), 'billing page sits on toets first');
assert.ok(/Version 1\.3\.96-toets/.test(stagingHtml));
assert.ok(/Version 1\.3\.65/.test(liveHtml));
assert.ok(/fire-s-subscribe\.js\?v=1-25-back-home/.test(stagingHtml));
assert.ok(/fire-s-entitlement\.js\?v=1-3-96-back-home/.test(stagingHtml));
assert.ok(/fire-s-subscribe\.css\?v=1-12-company/.test(stagingHtml));

assert.ok(/\.fire-s-company-billing/.test(stagingCss));
assert.ok(/\.fire-s-company-billing-list/.test(stagingCss));
assert.ok(/\.fire-s-subscribe-status\.is-past_due/.test(stagingCss));

assert.ok(/function paintCompanyBilling\(/.test(stagingSubscribe));
assert.ok(/function loadCompanyBilling\(/.test(stagingSubscribe));
assert.ok(/rpc\('fire_s_get_company_billing'\)/.test(stagingSubscribe));
assert.ok(/Payment past due/.test(stagingSubscribe));
assert.ok(/billingSubscribe/.test(stagingSubscribe));
assert.ok(/fireSBillingSubscribeBtn/.test(stagingSubscribe));
assert.ok(/fireSBillingCancelBtn/.test(stagingSubscribe));
assert.ok(!/payfast_subscription_token/.test(stagingSubscribe));
assert.ok(!/merchant_key/.test(stagingSubscribe));
assert.ok(!/passphrase/.test(stagingSubscribe));

assert.ok(/past_due_grace/.test(stagingEntitlement));
assert.ok(/cancelled_until_period_end/.test(stagingEntitlement));
assert.ok(/Payment past due — grace period/.test(stagingEntitlement));
assert.ok(!/past_due_grace/.test(liveEntitlement), 'live entitlement waits for sit dit live');
assert.ok(!/function paintCompanyBilling\(/.test(liveSubscribe), 'live subscribe waits for sit dit live');

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
      }
    };
  }
  return nodes[id];
}

function loadEntitlement() {
  const store = {};
  const nodes = {};
  const sandbox = {
    window: { currentUserProfile: { id: 'u1', email: 'a@b.c', companyId: 'co1', role: 'company_owner' } },
    location: { hash: '', search: '', href: 'https://example.test/staging/' },
    document: {
      readyState: 'complete',
      addEventListener: function () {},
      getElementById: function (id) { return fakeEl(id, nodes); },
      body: { classList: { toggle: function () {}, contains: function () { return false; } }, appendChild: function () {} },
      createElement: function () {
        return { id: '', className: '', hidden: true, innerHTML: '', addEventListener: function () {}, style: {} };
      }
    },
    console: console,
    localStorage: {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem: function (key, value) {
        store[key] = String(value);
      }
    },
    alert: function () {},
    setTimeout: function () { return 0; },
    setInterval: function () { return 0; },
    clearInterval: function () {}
  };
  sandbox.window = sandbox;
  sandbox.currentUserProfile = sandbox.window.currentUserProfile;
  vm.runInNewContext(stagingEntitlement, sandbox);
  sandbox.__nodes = nodes;
  return sandbox;
}

const ent = loadEntitlement();
const graceCopy = ent.fireSEntitlement.displayCopy({
  status: 'subscription_past_due',
  reason: 'past_due_grace',
  allowed: true,
  in_grace: true,
  backendReady: true,
  plan: 'standard',
  billing_interval: 'monthly'
});
assert.strictEqual(graceCopy.urgency, 'mid');
assert.ok(/grace period/i.test(graceCopy.detail));
assert.ok(/grace period/i.test(ent.fireSEntitlement.statusLabel({
  status: 'subscription_past_due',
  reason: 'past_due_grace',
  in_grace: true
})));

const cancelCopy = ent.fireSEntitlement.displayCopy({
  status: 'subscription_cancelled',
  reason: 'cancelled_until_period_end',
  allowed: true,
  can_read: true,
  backendReady: true
});
assert.strictEqual(cancelCopy.urgency, 'mid');
assert.ok(/paid-through/i.test(cancelCopy.detail));
assert.ok(/locked until a new subscription is active/i.test(cancelCopy.detail));

const cancelExpiredCopy = ent.fireSEntitlement.displayCopy({
  status: 'subscription_cancelled',
  reason: 'subscription_required',
  allowed: false,
  can_read: false,
  backendReady: true
});
assert.strictEqual(cancelExpiredCopy.urgency, 'block');
assert.ok(/locked until a new subscription is active/i.test(cancelExpiredCopy.detail));

const blockedPastDue = ent.fireSEntitlement.displayCopy({
  status: 'subscription_past_due',
  reason: 'subscription_required',
  allowed: false,
  in_grace: false,
  backendReady: true
});
assert.strictEqual(blockedPastDue.urgency, 'block');
assert.ok(/Payment past due/.test(ent.fireSEntitlement.statusLabel({
  status: 'subscription_past_due',
  reason: 'subscription_required',
  in_grace: false
})));

(async function runBillingPaint() {
  const nodes = {};
  const store = {};
  let rpcName = '';
  const sandbox = {
    window: {
      currentUserProfile: { id: 'owner-1', email: 'owner@example.test', companyId: 'co-1', role: 'company_owner' },
      resolveFireSHomeRole: function () { return 'company_owner'; },
      fireSSubscriptionCatalog: {
        currentSubscriptionSummary: function () {
          return { heading: 'Current subscription', title: 'Monthly · R250', detail: 'Active' };
        },
        statusHeadline: function () { return 'Active'; },
        statusKeepDataNote: function () { return 'Data stays.'; }
      }
    },
    location: { hash: '', search: '', href: 'https://example.test/staging/' },
    document: {
      readyState: 'complete',
      addEventListener: function () {},
      getElementById: function (id) { return fakeEl(id, nodes); },
      body: { classList: { toggle: function () {}, contains: function () { return false; } }, appendChild: function () {} },
      createElement: function () {
        return { id: '', className: '', hidden: true, innerHTML: '', addEventListener: function () {}, style: {} };
      }
    },
    console: console,
    localStorage: {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem: function (key, value) {
        store[key] = String(value);
      }
    },
    alert: function () {},
    setTimeout: function () { return 0; },
    Promise: Promise
  };
  sandbox.currentUserProfile = sandbox.window.currentUserProfile;
  sandbox.resolveFireSHomeRole = sandbox.window.resolveFireSHomeRole;
  sandbox.fireSSubscriptionCatalog = sandbox.window.fireSSubscriptionCatalog;
  sandbox.supabaseClient = {
    rpc: async function (name) {
      rpcName = name;
      assert.strictEqual(name, 'fire_s_get_company_billing');
      return {
        data: {
          plan: 'standard',
          billing_interval: 'annual',
          subscription_status: 'past_due',
          status: 'subscription_past_due',
          in_grace: true,
          trial_ends_at: '2026-09-01T00:00:00Z',
          paid_through: '2026-10-01T00:00:00Z',
          next_billing_at: '2026-10-01T00:00:00Z',
          last_successful_payment_at: '2026-09-01T00:00:00Z',
          grace_ends_at: '2026-10-08T00:00:00Z',
          can_subscribe: true,
          can_cancel: true,
          keep_data: true
        }
      };
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(stagingSubscribe, sandbox);
  sandbox.fireSPaintSubscribeCurrent();
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(rpcName, 'fire_s_get_company_billing');
  assert.strictEqual(nodes.fireSBillingPlan.textContent, 'standard');
  assert.strictEqual(nodes.fireSBillingInterval.textContent, 'annual');
  assert.strictEqual(nodes.fireSBillingStatus.textContent, 'past_due');
  assert.strictEqual(nodes.fireSBillingTrial.textContent, '2026-09-01');
  assert.strictEqual(nodes.fireSBillingPaidThrough.textContent, '2026-10-01');
  assert.strictEqual(nodes.fireSBillingNext.textContent, '2026-10-01');
  assert.strictEqual(nodes.fireSBillingLastPaid.textContent, '2026-09-01');
  assert.strictEqual(nodes.fireSBillingGrace.hidden, false);
  assert.ok(/Grace period until 2026-10-08/.test(nodes.fireSBillingGrace.textContent));
  assert.strictEqual(nodes.fireSBillingCancelBtn.hidden, false);

  console.log('subscription-lifecycle.test.js: ok');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
