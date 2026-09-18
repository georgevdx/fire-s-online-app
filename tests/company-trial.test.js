'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('SUPABASE_company_trial.sql');
const migration = read('supabase/migrations/20260917140000_fire_s_company_trial.sql');
const entitlementSql = read('SUPABASE_company_entitlement.sql');
const accessSql = read('SUPABASE_entitlement_access.sql');
const addMemberSql = read('SUPABASE_add_member_by_email.sql');
const stagingJs = read('staging/fire-s-entitlement.js');
const stagingApp = read('staging/app.js');
const stagingHtml = read('staging/index.html');
const stagingSubscribe = read('staging/fire-s-subscribe.js');
const liveJs = read('fire-s-entitlement.js');
const liveHtml = read('index.html');

assert.strictEqual(sql, migration, 'SQL Editor copy must match the migration');

assert.ok(/trial_days integer not null default 14/.test(entitlementSql));
assert.ok(/trial_inspection_limit integer not null default 3/.test(entitlementSql));
assert.ok(/v_started := now\(\)/.test(sql));
assert.ok(/v_ends := v_started \+ make_interval\(days => coalesce\(v_days, 14\)\)/.test(sql));
assert.ok(/trial_ends_at = v_ends/.test(sql));
assert.ok(/trial_expires_at = v_ends/.test(sql));
assert.ok(/Never restart a used trial/.test(sql));
assert.ok(/v_now timestamptz := now\(\)/.test(sql));
assert.ok(/clock', 'server'/.test(sql) || /'clock', 'server'/.test(sql));
assert.ok(/Client Date \/ localStorage are ignored/.test(sql));
assert.ok(/fire_s_trial_founders/.test(sql));
assert.ok(/Extra users \/ a second company/.test(sql));
assert.ok(/Same founder must not start a second trial/.test(sql));
assert.ok(/Only Super Admin can start another company/.test(sql));
assert.ok(/fire_s_trial_claims_delete/.test(sql));
assert.ok(/using \(false\)/.test(sql));
assert.ok(/v_used >= v_limit/.test(sql));
assert.ok(/keep_data', true/.test(sql) || /'keep_data', true/.test(sql));
assert.ok(!/delete from public\.inspections/.test(sql));
assert.ok(!/delete from public\.fire_s_trial_finalised_inspections/.test(sql));
assert.ok(/revoke all on function public\.fire_s_start_company_trial\(uuid\) from authenticated/.test(sql));
assert.ok(/grant execute on function public\.fire_s_start_company_trial\(uuid\) to service_role/.test(sql));
assert.ok(/with check \(false\)/.test(entitlementSql), 'direct companies insert cannot start a trial');
assert.ok(/fire_s_count_finalised_inspections/.test(entitlementSql));
assert.ok(!/references public\.inspections/.test(entitlementSql.match(/create table if not exists public\.fire_s_trial_finalised_inspections[\s\S]*?;/)[0]));
assert.ok(!/fire_s_start_company_trial/.test(addMemberSql), 'additional users must not start a trial');
assert.ok(!/insert into public\.companies/.test(addMemberSql), 'add member must not create a company');
assert.ok(/fire_s_get_company_entitlement/.test(accessSql));
assert.ok(/A subscription is required to start new inspections/.test(accessSql));

assert.ok(/browser clock/.test(stagingJs));
assert.ok(/trial_ends_at/.test(stagingJs));
assert.ok(/Subscribe on PayFast to continue/.test(stagingJs));
assert.ok(/Subscribe \/ Reactivate/.test(stagingJs));
assert.ok(/fire-s-entitlement\.js\?v=1-3-home-lock/.test(stagingHtml));
assert.ok(/Start a 14-day free trial/.test(stagingHtml));
assert.ok(/fireSEntitlement\.refresh/.test(stagingApp));
assert.ok(/status = 'unpaid'/.test(stagingSubscribe));
const subscribeStatusFn = stagingSubscribe.match(
  /function paintSubscribeStatus\(\) \{[\s\S]*?function cancelSubscription/
);
assert.ok(subscribeStatusFn, 'paintSubscribeStatus must exist');
assert.ok(/entitlement && entitlement\.backendReady/.test(subscribeStatusFn[0]));
assert.ok(
  !/cat\.billingStatus\(\)/.test(subscribeStatusFn[0]),
  'server entitlement must set subscribe status, not localStorage billingStatus'
);
assert.ok(!/Subscribe on PayFast to continue/.test(liveJs), 'live entitlement copy waits for sit dit live');
assert.ok(!/id="fireSSubscriptionRequiredSection"/.test(liveHtml));

function loadClient(extra) {
  const store = {};
  const RealDate = Date;
  const sandbox = {
    window: {},
    location: { hash: '', search: '', href: 'https://example.test/staging/' },
    document: {
      readyState: 'complete',
      addEventListener: function () {},
      getElementById: function () { return null; },
      body: { classList: { toggle: function () {}, contains: function () { return false; } }, appendChild: function () {} },
      createElement: function () {
        return { id: '', className: '', hidden: true, innerHTML: '', addEventListener: function () {}, style: {} };
      }
    },
    console: console,
    Date: RealDate,
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
  Object.assign(sandbox, extra || {});
  sandbox.window = sandbox;
  sandbox.currentUserProfile = sandbox.currentUserProfile || {
    id: 'owner-1',
    email: 'owner@example.test',
    companyId: 'co-1',
    role: 'company_owner'
  };
  vm.runInNewContext(stagingJs, sandbox);
  sandbox.__store = store;
  return sandbox;
}

(async function run() {
  // Normal trial: server snapshot allows create/finalise.
  const active = loadClient();
  const normal = active.fireSEntitlement.displayCopy({
    status: 'trial_active',
    allowed: true,
    can_create: true,
    can_finalise: true,
    backendReady: true,
    trial_days_remaining: 14,
    trial_inspections_remaining: 3,
    trial_inspections_used: 0,
    trial_inspection_limit: 3,
    trial_started_at: '2026-09-17T00:00:00Z',
    trial_ends_at: '2026-10-01T00:00:00Z'
  });
  assert.ok(/Trial — 14 days remaining/.test(normal.headline));
  assert.ok(/3 trial inspection/.test(normal.detail));
  assert.ok(/Subscribe \/ Reactivate/.test(normal.cta));

  // Expired trial: paid writes blocked, data kept, PayFast CTA.
  const expiredCopy = active.fireSEntitlement.displayCopy({
    status: 'trial_expired',
    reason: 'trial_expired',
    allowed: false,
    can_create: false,
    can_finalise: false,
    can_read: true,
    keep_data: true,
    backendReady: true,
    trial_days_remaining: 0,
    trial_ends_at: '2026-09-01T00:00:00Z'
  });
  assert.strictEqual(expiredCopy.urgency, 'block');
  assert.ok(/PayFast/.test(expiredCopy.detail));
  assert.ok(/ended/i.test(active.fireSEntitlement.statusLabel({ status: 'trial_expired' })));
  assert.ok(/2026-09-01/.test(active.fireSEntitlement.trialLine({
    status: 'trial_expired',
    reason: 'trial_expired',
    trial_ends_at: '2026-09-01T00:00:00Z'
  })));

  // Trial inspection limit.
  const limitCopy = active.fireSEntitlement.displayCopy({
    status: 'trial_active',
    reason: 'trial_limit_reached',
    allowed: false,
    can_create: true,
    can_finalise: false,
    backendReady: true,
    trial_days_remaining: 10,
    trial_inspections_remaining: 0,
    trial_inspections_used: 3,
    trial_inspection_limit: 3
  });
  assert.ok(/Trial inspections used/.test(limitCopy.headline));
  assert.ok(/PayFast/.test(limitCopy.detail));

  // Manipulated localStorage / new browser must not invent a trial.
  active.__store['fireS.billingStatus'] = 'trial';
  active.__store['fireS.trialEndsAt'] = '2099-01-01';
  active.__store['fireS.trial_started_at'] = '2026-01-01';
  assert.strictEqual(active.fireSEntitlement.hasSnapshot(), false);
  assert.strictEqual(active.fireSEntitlement.canCreate(), false);
  assert.strictEqual(active.fireSEntitlement.operationallyAllowed(), false);

  // Manipulated browser clock must not grant access.
  const clock = loadClient();
  clock.Date = function FakeDate() {
    return new Date('2099-12-31T00:00:00Z');
  };
  clock.Date.now = function () { return Date.parse('2099-12-31T00:00:00Z'); };
  assert.strictEqual(clock.fireSEntitlement.canCreate(), false, 'future browser clock must not start a trial');
  assert.strictEqual(clock.fireSEntitlement.operationallyAllowed(), false);

  // Direct API / RPC: client asks getCompanyEntitlement; expired stays expired.
  const apiClient = loadClient();
  let rpcName = '';
  apiClient.supabaseClient = {
    rpc: async function (name) {
      rpcName = name;
      return {
        data: {
          allowed: false,
          can_create: false,
          can_finalise: false,
          can_read: true,
          keep_data: true,
          authority: 'server',
          clock: 'server',
          status: 'trial_expired',
          reason: 'trial_expired',
          trial_started_at: '2026-08-01T00:00:00Z',
          trial_ends_at: '2026-08-15T00:00:00Z',
          trial_inspections_used: 1,
          trial_inspection_limit: 3,
          super_admin: false
        }
      };
    }
  };
  const info = await apiClient.getCompanyEntitlement('co-1');
  assert.ok(rpcName === 'fire_s_get_company_entitlement' || rpcName === 'fire_s_check_company_entitlement');
  assert.strictEqual(info.clock, 'server');
  assert.strictEqual(info.allowed, false);
  assert.strictEqual(info.can_create, false);
  assert.strictEqual(info.keep_data, true);
  assert.strictEqual(apiClient.fireSEntitlement.canCreate(), false);
  assert.strictEqual(
    apiClient.fireSEntitlement.inspectionAccessLocked(),
    true,
    'expired trial must stay on Home until subscribed, even if can_read is still true'
  );

  // Additional company user uses the same company snapshot, not a new trial.
  const inspector = loadClient({
    currentUserProfile: {
      id: 'insp-1',
      email: 'insp@example.test',
      companyId: 'co-1',
      role: 'inspector'
    }
  });
  inspector.supabaseClient = apiClient.supabaseClient;
  const inspectorInfo = await inspector.getCompanyEntitlement('co-1');
  assert.strictEqual(inspectorInfo.status, 'trial_expired');
  assert.strictEqual(inspector.fireSEntitlement.canCreate(), false);

  // Logout / login: membership loader refreshes the server snapshot.
  assert.ok(/fireSEntitlement\.refresh/.test(stagingApp));

  // Super Admin keeps access.
  inspector.currentUserProfile.role = 'super_admin';
  inspector.isSuperAdmin = function () { return true; };
  assert.strictEqual(inspector.fireSEntitlement.canCreate(), true);

  console.log('company-trial.test.js: ok');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
