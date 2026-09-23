'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('SUPABASE_entitlement_access.sql');
const migration = read('supabase/migrations/20260917120000_fire_s_get_company_entitlement.sql');
const stagingJs = read('staging/fire-s-entitlement.js');
const stagingApp = read('staging/app.js');
const stagingHtml = read('staging/index.html');
const liveApp = read('app.js');
const liveHtml = read('index.html');
const entitlementSql = read('SUPABASE_company_entitlement.sql');

assert.strictEqual(sql, migration, 'SQL Editor copy must match the migration');

assert.ok(/fire_s_get_company_entitlement/.test(sql));
assert.ok(/authority', 'server'/.test(sql) || /'authority', 'server'/.test(sql));
assert.ok(/fire_s_inspection_starts_new_cycle/.test(sql));
assert.ok(/A subscription is required to start a new inspection cycle/.test(sql));
assert.ok(/A subscription is required to start new inspections/.test(sql));
assert.ok(/A Fire-S subscription is required to add company logins/.test(sql));
assert.ok(/m\.user_id = NEW\.user_id/.test(sql), 'existing login must reactivate without adding a seat');
assert.ok(/keep_data/.test(sql));
assert.ok(/super_admin/.test(sql));
assert.ok(/fire_s_require_company_write/.test(sql));
assert.ok(/fire_s_company_members_entitlement_guard/.test(sql));
assert.ok(/fire_s_company_can_read_inspections/.test(sql));
assert.ok(/fire_s_inspections_entitlement_delete_guard/.test(sql));
assert.ok(/Inspections stay in the cloud/.test(sql));
assert.ok(/grant execute on function public\.fire_s_get_company_entitlement\(uuid\) to authenticated/.test(sql));
assert.ok(!/delete from public\.inspections/.test(sql));
assert.ok(!/drop table if exists public\.inspections/.test(sql));
assert.ok(/return public\.fire_s_get_company_entitlement/.test(sql));

assert.ok(/create trigger fire_s_inspections_entitlement_guard/.test(entitlementSql));
assert.ok(/if public\.fire_s_is_super_admin\(\) then\s+return NEW/s.test(entitlementSql));
assert.ok(/fire_s_protect_company_entitlement/.test(entitlementSql));
assert.ok(/with check \(false\)/.test(entitlementSql));

assert.ok(/id="fireSSubscriptionRequiredSection"/.test(stagingHtml));
assert.ok(/Subscribe \/ Reactivate/.test(stagingHtml));
assert.ok(/georgevdx@gmail\.com/.test(stagingHtml));
assert.ok(/Inspections, reports, premises and photos stay/.test(stagingHtml));
assert.ok(/fire-s-entitlement.js\?v=1-3-113-temp-pw/.test(stagingHtml));
assert.ok(/id="fireSSubscriptionRequiredSection"/.test(liveHtml), 'required screen sits live');

assert.ok(/getCompanyEntitlement/.test(stagingJs));
assert.ok(/openRequiredScreen/.test(stagingJs));
assert.ok(/guardDirectUrl/.test(stagingJs));
assert.ok(/createNewProject/.test(stagingJs));
assert.ok(/archiveProjectCurrentInspectionAndStartBlank/.test(stagingJs));
assert.ok(/startNewInspectionForPremises/.test(stagingJs));
assert.ok(/openGateStartBtn/.test(stagingJs));
assert.ok(/if \(!info \|\| !info\.backendReady\) {\s*return deny\('subscription_required'\)/s.test(stagingJs));
assert.ok(/must not GRANT access from localStorage/.test(stagingJs));
assert.ok(/fire_s_compute_entitlement\(v_company\)/.test(sql), 'inspection trigger must not write entitlement on every save');
assert.ok(/with check \(false\)/.test(entitlementSql), 'direct companies insert cannot grant paid access');

assert.ok(/fireSEntitlement\.hasSnapshot/.test(stagingApp));
assert.ok(/operationallyAllowed\(\) === true/.test(stagingApp));
assert.ok(!/currentCompanyAccess\?\.status === 'active' \|\|/.test(stagingApp.match(/function hasActiveCompanyAccess\(\) \{[\s\S]*?\n\}/)[0]));

assert.ok(/function canViewReports\(\) \{[\s\S]*isSuperAdmin[\s\S]*fireSEntitlementGate\('export'\)[\s\S]*viewer/.test(stagingApp));
assert.ok(/inspectionAccessLocked\(\)/.test(stagingApp));
const liveCanView = liveApp.match(/function canViewReports\(\) \{[\s\S]*?\n\}/);
assert.ok(liveCanView && /fireSEntitlementGate\('export'\)/.test(liveCanView[0]), 'live report gate must use entitlement');

const store = {};
const nodes = {};
function fakeEl(id) {
  if (!nodes[id]) {
    nodes[id] = {
      id: id,
      hidden: true,
      style: { display: 'none' },
      textContent: '',
      className: '',
      innerHTML: '',
      addEventListener: function () {},
      querySelector: function () { return null; },
      insertBefore: function () {},
      setAttribute: function () {},
      removeAttribute: function () {},
      classList: { add: function () {}, toggle: function () {}, contains: function () { return false; } }
    };
  }
  return nodes[id];
}

const sandbox = {
  window: { currentUserProfile: { id: 'u1', email: 'a@b.c', companyId: 'co1', role: 'company_owner' } },
  location: { hash: '#newInspection', search: '?inspect=new', href: 'https://example.test/staging/#newInspection' },
  document: {
    readyState: 'complete',
    addEventListener: function () {},
    getElementById: fakeEl,
    body: { classList: { add: function () {}, toggle: function () {}, contains: function () { return false; } }, appendChild: function () {} },
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
  setTimeout: function () {
    return 0;
  },
  setInterval: function () {
    return 0;
  },
  clearInterval: function () {}
};
sandbox.window = sandbox;
sandbox.currentUserProfile = {
  id: 'u1',
  email: 'a@b.c',
  companyId: 'co1',
  role: 'company_owner'
};
vm.runInNewContext(stagingJs, sandbox);

const api = sandbox.fireSEntitlement;
assert.ok(api.getCompanyEntitlement);
assert.strictEqual(typeof sandbox.getCompanyEntitlement, 'function');
assert.ok(api.guardDirectUrl);

store['fireS.billingStatus'] = 'active';
store['fireS.trialExpiresAt'] = '2099-01-01';
assert.strictEqual(api.hasSnapshot(), false, 'localStorage must not make entitlement ready');
assert.strictEqual(api.operationallyAllowed(), false, 'cloud client must not invent access before the server RPC');
assert.strictEqual(api.canCreate(), false, 'missing RPC must not allow new inspections');

const blocked = api.displayCopy({
  status: 'subscription_cancelled',
  reason: 'subscription_required',
  allowed: false,
  can_create: false,
  backendReady: true,
  plan: 'standard',
  billing_interval: 'annual',
  trial_days_remaining: 0
});
assert.ok(blocked.show);
assert.strictEqual(blocked.urgency, 'block');
assert.ok(/Subscribe \/ Reactivate/.test(blocked.cta));
assert.ok(/cancelled/i.test(api.statusLabel({ status: 'subscription_cancelled' })));

(async function bypassCases() {
  sandbox.supabaseClient = {
    rpc: async function (name) {
      assert.ok(
        name === 'fire_s_get_company_entitlement' || name === 'fire_s_check_company_entitlement',
        'client must ask the server entitlement RPC, not invent access'
      );
      return {
        data: {
          allowed: false,
          can_create: false,
          can_finalise: false,
          can_write_draft: false,
          can_read: false,
          can_export: false,
          keep_data: true,
          authority: 'server',
          status: 'subscription_cancelled',
          reason: 'subscription_required',
          plan: 'standard',
          billing_interval: 'monthly',
          trial_days_remaining: 0,
          super_admin: false
        }
      };
    }
  };

  store['fireS.billingStatus'] = 'active';
  store['fireS.entitlement'] = JSON.stringify({ allowed: true, can_create: true });
  const info = await api.getCompanyEntitlement('co1');
  assert.strictEqual(info.authority, 'server');
  assert.strictEqual(info.allowed, false);
  assert.strictEqual(info.can_create, false);
  assert.strictEqual(info.can_read, false);
  assert.strictEqual(info.keep_data, true);
  assert.strictEqual(api.canCreate(), false, 'localStorage paid flag must not override the server');
  assert.strictEqual(api.canRead(), false, 'cancelled companies must not open inspections');
  assert.strictEqual(api.operationallyAllowed(), false);

  api.guardDirectUrl();
  assert.strictEqual(nodes.homeSection.hidden, false, 'direct #newInspection URL must keep the user on Home');
  assert.strictEqual(nodes.projectFormSection.hidden, true, 'inspection form must stay closed after expiry');
  assert.ok(nodes.fireSHomeLockPanel && nodes.fireSHomeLockPanel.hidden === false, 'Home lock panel must show Subscribe');

  sandbox.currentUserProfile.role = 'super_admin';
  sandbox.isSuperAdmin = function () { return true; };
  assert.strictEqual(api.canCreate(), true, 'super_admin keeps write access');
  assert.strictEqual(api.operationallyAllowed(), true);

  console.log('entitlement-access.test.js: ok');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
