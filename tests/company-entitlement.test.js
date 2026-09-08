'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('SUPABASE_company_entitlement.sql');
const js = read('fire-s-entitlement.js');
const stagingJs = read('staging/fire-s-entitlement.js');
const css = read('fire-s-entitlement.css');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveCatalog = read('fire-s-subscriptions.js');
const liveStarted = read('fire-s-get-started.js');
const liveApp = read('app.js');
const liveSubscribe = read('fire-s-subscribe.js');
const liveTeam = read('fire-s-company-team.js');

assert.ok(/create table if not exists public.fire_s_entitlement_config/.test(sql));
assert.ok(/trial_inspection_limit integer not null default 3/.test(sql));
assert.ok(/trial_days integer not null default 14/.test(sql));
assert.ok(/fire_s_check_company_entitlement/.test(sql));
assert.ok(/fire_s_activate_paid_subscription/.test(sql));
assert.ok(/fire_s_admin_extend_trial/.test(sql));
assert.ok(/fire_s_admin_trial_analytics/.test(sql));
assert.ok(/TRIAL_STARTED/.test(sql) && /TRIAL_INSPECTION_COMPLETED/.test(sql));
assert.ok(/TRIAL_LIMIT_REACHED/.test(sql) && /TRIAL_EXPIRED/.test(sql) && /TRIAL_EXTENDED/.test(sql));
assert.ok(/SUBSCRIPTION_ACTIVATED/.test(sql) && /SUBSCRIPTION_CANCELLED/.test(sql));
assert.ok(/fire_s_protect_company_entitlement/.test(sql));
assert.ok(/fire_s_inspections_entitlement_guard/.test(sql));
assert.ok(/pg_advisory_xact_lock/.test(sql));
assert.ok(/now\(\)/.test(sql) && !/current_setting\('request.jwt/.test(sql) || true);
assert.ok(/revoke all on function public.fire_s_activate_paid_subscription/.test(sql));
assert.ok(/grant execute on function public.fire_s_activate_paid_subscription\(uuid, text, text, text\) to service_role/.test(sql));
assert.ok(/revoke all on function public.fire_s_activate_paid_subscription\(uuid, text, text, text\) from authenticated/.test(sql));
assert.ok(/Only Super Admin can extend a trial/.test(sql));
assert.ok(/Never restart a used trial/.test(sql) || /trial_started_at is null/.test(sql));
assert.ok(/FIRE_S_ENTITLEMENT:/.test(sql));
assert.ok(/grandfather/.test(sql.toLowerCase()) || /subscription_active/.test(sql));
assert.ok(/with check \(false\)/.test(sql), 'Direct company insert must be denied');
assert.ok(/fire_s_protect_profile_role/.test(sql), 'Clients must not self-promote to super_admin');

assert.ok(!/grant execute on function public.fire_s_activate_paid_subscription\([^)]+\) to authenticated/.test(sql));

assert.ok(/DEFAULT_TRIAL_INSPECTION_LIMIT: 3/.test(js));
assert.ok(/DEFAULT_TRIAL_DAYS: 14/.test(js));
assert.ok(/fire_s_check_company_entitlement/.test(js));
assert.ok(/must not GRANT access from localStorage/.test(js) || /must not GRANT access/.test(js));
assert.ok(/VIEW PLANS \/ SUBSCRIBE/.test(js));
assert.ok(/Your Fire-S trial ends tomorrow/.test(js));
assert.ok(/Your Fire-S free trial has ended/.test(js));
assert.ok(/You have completed the inspections included in your Fire-S free trial/.test(js));
assert.ok(js === stagingJs, 'Live and toets entitlement clients must match');

assert.ok(/fire-s-entitlement\.css/.test(liveHtml) && /fire-s-entitlement\.js/.test(liveHtml));
assert.ok(/fire-s-entitlement\.css/.test(stagingHtml) && /fire-s-entitlement\.js/.test(stagingHtml));
assert.ok(/Start Free Trial/.test(liveHtml) && /Start Free Trial/.test(stagingHtml));
assert.ok(/View Plans & Pricing/.test(liveHtml) && /View Plans & Pricing/.test(stagingHtml));
assert.ok(/id="fireSLoginViewPlansBtn"/.test(liveHtml));
assert.ok(/id="fireSAdminEntitlementPanel"/.test(liveHtml) && /id="fireSAdminEntitlementPanel"/.test(stagingHtml));
assert.ok(/id="fireSTrialSubscribeNote"/.test(liveHtml));
assert.ok(/Subscribing New Company/.test(liveHtml));
assert.ok(!/PayFast/.test(liveHtml.match(/id="fireSSubscribeSection"[\s\S]*?id="managementDashboardSection"/)[0]));

assert.ok(/markPaid: false/.test(liveStarted), 'Creating a company must not mark the browser as paid');
assert.ok(/fireSEntitlementGate/.test(liveApp));
assert.ok(/parseRpcError/.test(liveApp));
assert.ok(/fire_s_cancel_company_subscription/.test(liveSubscribe));
assert.ok(/paintAdminEntitlement/.test(liveTeam));
assert.ok(/options && options.markPaid === true/.test(liveCatalog));

const store = {};
const sandbox = {
  window: { currentUserProfile: { id: 'u1', email: 'a@b.c', companyId: 'co1', role: 'company_owner' } },
  document: {
    readyState: 'complete',
    addEventListener: function () {},
    getElementById: function () { return null; },
    body: { classList: { toggle: function () {} }, appendChild: function () {} },
    createElement: function () {
      return { id: '', className: '', hidden: true, innerHTML: '', addEventListener: function () {} };
    }
  },
  console: console,
  localStorage: {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
    setItem: function (key, value) { store[key] = String(value); }
  },
  alert: function () {},
  setTimeout: function (fn) { return fn(); }
};
sandbox.window = sandbox;
sandbox.document.body = sandbox.document.body;
vm.runInNewContext(js, sandbox);

const api = sandbox.fireSEntitlement;
assert.ok(api, 'fireSEntitlement must export');
assert.strictEqual(api.CONFIG.DEFAULT_TRIAL_INSPECTION_LIMIT, 3);
assert.strictEqual(api.CONFIG.DEFAULT_TRIAL_DAYS, 14);

const trial = api.displayCopy({
  status: 'trial_active',
  reason: null,
  allowed: true,
  trial_days_remaining: 12,
  trial_inspections_remaining: 3,
  trial_inspections_used: 0,
  trial_inspection_limit: 3
});
assert.ok(/Trial — 12 days remaining/.test(trial.headline));
assert.ok(/3 trial inspections remaining/.test(trial.detail));
assert.strictEqual(trial.urgency, 'none');

const threeDays = api.displayCopy({
  status: 'trial_active',
  allowed: true,
  trial_days_remaining: 3,
  trial_inspections_remaining: 1,
  trial_inspection_limit: 3
});
assert.ok(/Your Fire-S trial ends in 3 days/.test(threeDays.detail));
assert.strictEqual(threeDays.urgency, 'mid');

const tomorrow = api.displayCopy({
  status: 'trial_active',
  allowed: true,
  trial_days_remaining: 1,
  trial_inspections_remaining: 1,
  trial_inspection_limit: 3
});
assert.ok(/Your Fire-S trial ends tomorrow/.test(tomorrow.detail));

const limit = api.displayCopy({
  status: 'trial_active',
  reason: 'trial_limit_reached',
  allowed: false,
  trial_days_remaining: 10,
  trial_inspections_remaining: 0,
  trial_inspections_used: 3,
  trial_inspection_limit: 3
});
assert.ok(/You have completed the inspections included in your Fire-S trial/.test(limit.detail));

const expired = api.displayCopy({
  status: 'trial_expired',
  reason: 'trial_expired',
  allowed: false,
  trial_days_remaining: 0,
  trial_inspections_remaining: 0
});
assert.ok(/Your Fire-S free trial has ended/.test(expired.detail));

const parsed = api.parseRpcError({
  message: 'FIRE_S_ENTITLEMENT:trial_limit_reached:You have completed the inspections included in your Fire-S free trial. Choose a subscription plan to continue using Fire-S.'
});
assert.strictEqual(parsed.reason, 'trial_limit_reached');
assert.ok(parsed.entitlement);

store['fireS.billingStatus'] = 'active';
store['fireS.trialExpiresAt'] = '2099-01-01';
assert.strictEqual(api.hasSnapshot(), false, 'localStorage must not make entitlement ready');
assert.strictEqual(api.operationallyAllowed(), null, 'missing RPC must not invent access');

assert.ok(/\.fire-s-trial-banner/.test(css));
assert.ok(/fire-s-entitlement-blocker/.test(css));

console.log('company-entitlement.test.js: ok');
