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

const resubscribe = read('SUPABASE_payfast_resubscribe.sql');
const openCompany = read('SUPABASE_payfast_open_company.sql');
const myCompany = read('SUPABASE_my_company.sql');
const lifecycle = read('SUPABASE_subscription_lifecycle.sql');
const checkout = read('supabase/functions/payfast-checkout/index.js');
const subscribe = read('staging/fire-s-subscribe.js');
const env = read('staging/fire-s-env.js');

const myCompanyResub = sliceFn(resubscribe, 'fire_s_my_company');
const myCompanyCanonical = sliceFn(myCompany, 'fire_s_my_company');
const myCompanyOpen = sliceFn(openCompany, 'fire_s_my_company');
assert.strictEqual(
  myCompanyResub.replace(/\s+/g, ' '),
  myCompanyCanonical.replace(/\s+/g, ' '),
  'fire_s_my_company in resubscribe SQL must match SUPABASE_my_company.sql'
);
assert.strictEqual(
  myCompanyOpen.replace(/\s+/g, ' '),
  myCompanyCanonical.replace(/\s+/g, ' '),
  'fire_s_my_company in open-company SQL must match SUPABASE_my_company.sql'
);

assert.ok(/cancelled', 'expired', 'past_due', 'unpaid/.test(myCompanyResub));
assert.ok(/when 'company_owner' then 0/.test(myCompanyResub));
assert.ok(/when v_super then 'super_admin'/.test(myCompanyResub));
assert.ok(!/when 'manager' then 0/.test(myCompanyResub), 'owner must beat manager for PayFast');

const billingResub = sliceFn(resubscribe, 'fire_s_get_company_billing');
const billingLife = sliceFn(lifecycle, 'fire_s_get_company_billing');
assert.strictEqual(
  billingResub.replace(/\s+/g, ' '),
  billingLife.replace(/\s+/g, ' '),
  'billing RPC in resubscribe SQL must match the lifecycle copy'
);
assert.ok(!/raise exception 'Company required'/.test(billingResub));
assert.ok(/can_subscribe', true/.test(billingResub));

assert.ok(/membershipCompany/.test(checkout));
assert.ok(/company_members\?select=/.test(checkout));
assert.ok(/role === 'super_admin'/.test(checkout));
assert.ok(/function pickOwnedCompany/.test(checkout));

assert.ok(/function billingFromEntitlement\(/.test(subscribe));
assert.ok(/p_company_id: cid/.test(subscribe));
assert.ok(/rpc\('fire_s_get_company_billing', args\)/.test(subscribe));
assert.ok(/function preparePayCompany\(/.test(subscribe));
assert.ok(/fire_s_prepare_payfast_company/.test(subscribe));
assert.ok(/p_company_name/.test(subscribe), 'PayFast must find the existing company by name');
assert.ok(/function existingCompanyPayError\(/.test(subscribe));
assert.ok(/already exists/.test(subscribe), 'cancelled company must reactivate, not create a new one');
assert.ok(/preparePayCompany\(\)/.test(subscribe), 'Pay must attach the linked company before PayFast opens');
assert.ok(/linkedCompanyId\(\) \|\| companyName\(\)/.test(subscribe), 'existing company must reactivate, not create a new name');
assert.ok(/fire_s_prepare_payfast_company/.test(openCompany));
assert.ok(/fire_s_payfast_checkout_intent/.test(openCompany));
assert.ok(
  /Do not insert company_members here/.test(openCompany),
  'PayFast prepare must not add a login on a cancelled company'
);
assert.ok(/m\.user_id = NEW\.user_id/.test(openCompany), 'same login must be able to reactivate');
assert.ok(/lower\(trim\(c\.name\)\)/.test(openCompany), 'existing company is found by name');
assert.ok(/cid \|\| name/.test(subscribe), 'existing company must still open PayFast if prepare is blocked');
assert.ok(/1\.3\.103-toets/.test(env), 'Toets-blad version must be 1.3.103-toets');

function fakeEl(id, nodes) {
  if (!nodes[id]) {
    nodes[id] = {
      id: id,
      hidden: true,
      style: { display: 'none' },
      textContent: '—',
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

(async function runCancelledBillingFallback() {
  const nodes = {};
  const sandbox = {
    window: {
      currentUserProfile: {
        id: 'owner-1',
        email: 'owner@example.test',
        companyId: 'toets-logo',
        companyName: 'Toets Logo',
        role: 'company_owner'
      },
      fireSEntitlement: {
        snapshot: function () {
          return {
            backendReady: true,
            plan: 'standard',
            billing_interval: 'monthly',
            status: 'subscription_cancelled',
            subscription_status: 'cancelled',
            subscription_paid_through: '2026-10-18T00:00:00Z',
            trial_ends_at: null,
            in_grace: false
          };
        }
      },
      fireSSubscriptionCatalog: {
        currentSubscriptionSummary: function () {
          return { heading: 'Current subscription', title: 'Monthly · R250 per login', detail: 'Cancelled' };
        },
        statusHeadline: function () { return 'Cancelled'; },
        statusKeepDataNote: function () { return 'Data stays.'; },
        billingStatus: function () { return 'cancelled'; }
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
      getItem: function () { return null; },
      setItem: function () {}
    },
    alert: function () {},
    setTimeout: function () { return 0; },
    Promise: Promise
  };
  sandbox.currentUserProfile = sandbox.window.currentUserProfile;
  sandbox.fireSEntitlement = sandbox.window.fireSEntitlement;
  sandbox.fireSSubscriptionCatalog = sandbox.window.fireSSubscriptionCatalog;
  sandbox.supabaseClient = {
    rpc: async function () {
      return { error: { message: 'Company required' }, data: null };
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(subscribe, sandbox);
  sandbox.fireSPaintSubscribeCurrent();
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(nodes.fireSBillingStatus.textContent, 'cancelled');
  assert.strictEqual(nodes.fireSBillingInterval.textContent, 'monthly');
  assert.strictEqual(nodes.fireSBillingPaidThrough.textContent, '2026-10-18');
  assert.ok(
    /This login pays for Toets Logo/.test(nodes.fireSSubscribeCompanyLine.textContent),
    nodes.fireSSubscribeCompanyLine.textContent
  );

  var alerts = [];
  var checkoutCalls = 0;
  sandbox.alert = function (msg) {
    alerts.push(String(msg || ''));
  };
  sandbox.supabaseClient.rpc = async function (name) {
    if (name === 'fire_s_prepare_payfast_company') {
      return {
        error: {
          message: 'FIRE_S_ENTITLEMENT:subscription_required:A Fire-S subscription is required to add company logins'
        },
        data: null
      };
    }
    return { error: { message: 'Create your company first, then pay on PayFast.' }, data: null };
  };
  sandbox.fireSPayfast = {
    isEnabled: function () { return true; },
    startCheckout: async function () {
      checkoutCalls += 1;
      return { ok: true };
    }
  };
  sandbox.window.fireSPayfast = sandbox.fireSPayfast;
  sandbox.fireSStartSubscribeCheckout();
  var shown = '';
  for (var i = 0; i < 20; i += 1) {
    await Promise.resolve();
    shown = String((nodes.fireSSubscribeMessage && nodes.fireSSubscribeMessage.textContent) || '');
    if (checkoutCalls) break;
  }
  assert.strictEqual(checkoutCalls, 1, 'cancelled Toets Logo must still open PayFast');
  assert.ok(!/add company logins/.test(shown), shown);
  assert.ok(!/FIRE_S_ENTITLEMENT/.test(shown), shown);
  assert.ok(!/Create your company first/.test(alerts.join(' ')), alerts.join(' '));
  console.log('payfast-resubscribe.test.js: ok');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
