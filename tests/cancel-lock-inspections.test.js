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

const lockSql = read('SUPABASE_cancel_lock_inspections.sql');
const lockMigration = read('supabase/migrations/20260918100000_fire_s_cancel_lock_inspections.sql');
const lifecycleSql = read('SUPABASE_subscription_lifecycle.sql');
const accessSql = read('SUPABASE_entitlement_access.sql');
const stagingEntitlement = read('staging/fire-s-entitlement.js');
const stagingCss = read('staging/fire-s-entitlement.css');
const stagingApp = read('staging/app.js');
const stagingHtml = read('staging/index.html');
const liveEntitlement = read('fire-s-entitlement.js');
const liveApp = read('app.js');
const liveHtml = read('index.html');

assert.strictEqual(lockSql, lockMigration, 'SQL Editor copy must match the cancel-lock migration');
assert.strictEqual(
  sliceFn(lockSql, 'fire_s_compute_entitlement'),
  sliceFn(lifecycleSql, 'fire_s_compute_entitlement'),
  'cancel-lock compute must match lifecycle compute'
);
assert.strictEqual(
  sliceFn(lockSql, 'fire_s_get_company_entitlement'),
  sliceFn(accessSql, 'fire_s_get_company_entitlement'),
  'cancel-lock getter must match entitlement-access getter'
);

const compute = sliceFn(lockSql, 'fire_s_compute_entitlement');
assert.ok(/cancelled_until_period_end/.test(compute));
assert.ok(/v_sub_status = 'cancelled'/.test(compute));
assert.ok(/'can_read', v_can_read/.test(compute));
assert.ok(/'can_export', v_can_export/.test(compute));
assert.ok(/keep_data', true/.test(compute));
assert.ok(!/'can_read', true/.test(compute));
assert.ok(/v_can_read := false/.test(compute));
assert.ok(!/delete from public\.inspections/.test(lockSql));
assert.ok(!/drop table if exists public\.inspections/.test(lockSql));

const getter = sliceFn(accessSql, 'fire_s_get_company_entitlement');
assert.ok(/'keep_data', true/.test(getter));
assert.ok(/'authority', 'server'/.test(getter));
assert.ok(
  !/v_info \|\| jsonb_build_object\(\s*'can_read', true,\s*'can_export', true,\s*'keep_data', true/s.test(getter),
  'members must not receive a can_read overlay'
);
assert.ok(/'can_read', true/.test(getter), 'super_admin overlay still grants read');

assert.ok(/fire_s_company_can_read_inspections/.test(lockSql));
assert.ok(/fire_s_inspections_select/.test(lockSql));
assert.ok(/fire_s_inspections_entitlement_delete_guard/.test(lockSql));
assert.ok(/cancel_keeps_access_until_paid_through = false/.test(lockSql));
assert.ok(/status = 'cancelled' then\s+return v_period/s.test(sliceFn(lockSql, 'fire_s_subscription_access_until')));

assert.ok(!/projectListSection: true/.test(liveEntitlement), 'live cancelled list must lock until a new subscription is active');
assert.ok(!/projectListSection: true/.test(stagingEntitlement));
assert.ok(!/reportSection: true/.test(stagingEntitlement));
assert.ok(/homeSection: true/.test(stagingEntitlement), 'locked users stay on Home until they subscribe');
assert.ok(/fireSCompanyBillingPanel: true/.test(stagingEntitlement));
assert.ok(/function pinLockedHome\(/.test(stagingEntitlement));
assert.ok(/Stay on Home until you subscribe/.test(stagingEntitlement));
assert.ok(/fireSSubscribeSection: true/.test(stagingEntitlement));
assert.ok(/function canRead\(/.test(stagingEntitlement));
assert.ok(/isAllowedLockedTarget/.test(stagingEntitlement));
assert.ok(/sendLockedActionToSubscribe/.test(stagingEntitlement));
assert.ok(/wrapNavFns/.test(stagingEntitlement));
assert.ok(/#cmdInspectionsBtn/.test(stagingCss));
assert.ok(/stopImmediatePropagation/.test(stagingEntitlement));
assert.ok(/openGateway/.test(stagingEntitlement));
assert.ok(/function inspectionHomeLocked\(/.test(read('staging/fire-s-clean-home-roles.js')));
assert.ok(/applyLockedSubscribeHome/.test(read('staging/fire-s-clean-home-roles.js')));
assert.ok(/if \(inspectionHomeLocked\(\)\) \{\s*wrapAllCommandCards\(\);\s*applyLockedSubscribeHome\(\);\s*return;/s.test(read('staging/fire-s-clean-home-roles.js')), 'locked Home must not first paint Gateway then hide it');
assert.ok(/if \(inspectionHomeLocked\(\)\) \{\s*applyCleanHome\(\);\s*return;/s.test(read('staging/fire-s-clean-home-roles.js')), 'locked Home must skip the command-centre layer');
assert.ok(!/setInterval\(function \(\) \{\s*if \(!inspectionAccessLocked\(\)\) return;\s*wrapNavFns\(\);/s.test(stagingEntitlement), 'do not re-hide Home cards on a 400ms timer');
assert.ok(/body\.fire-s-entitlement-blocked #homeSection \.home-hero/.test(stagingCss));
assert.ok(/body\.fire-s-entitlement-blocked #fireSTrialBanner/.test(stagingCss));
assert.ok(/body\.fire-s-entitlement-blocked #fireSEntitlementBlocker/.test(stagingCss));
assert.ok(/inspectionHomeLocked\(\) \|\| !canShowLists\(\)/.test(read('staging/fire-s-owner-lists.js')));
assert.ok(/fire-s-owner-lists\.js\?v=1-10-last-def/.test(stagingHtml));
assert.ok(/inspectionAccessLocked\(\)\) \{\s*banner\.hidden = true/s.test(stagingEntitlement));
assert.ok(/z-index: 2147483500/.test(stagingCss));
assert.ok(/stay locked until a new subscription is active/.test(stagingEntitlement));
assert.ok(/wrapOpenProject/.test(stagingEntitlement));
assert.ok(/class="fire-s-booting fire-s-entitlement-blocked"/.test(stagingHtml), 'HTML must start subscribe-only, not Executive Command Centre');
assert.ok(/html\.fire-s-entitlement-blocked #fireSDesktopAccess/.test(stagingCss));
assert.ok(/html\.fire-s-entitlement-blocked #mainCommandCentre \.main-command-top/.test(stagingCss));
assert.ok(/function homeWorkAllowed\(/.test(stagingEntitlement));
assert.ok(/if \(!hasSnapshot\(\)\) return false/.test(stagingEntitlement), 'do not flash the red Home lock while entitlement is still loading');
assert.ok(/function hideDesktopAccess\(/.test(stagingEntitlement));
assert.ok(/homeWorkAllowed/.test(read('staging/fire-s-desktop-access.js')));
assert.ok(/homeWorkAllowed/.test(stagingApp), 'KPI paints must not revive the executive layer while locked');
assert.ok(/fire-s-desktop-access\.js\?v=1-4-subscribe-first/.test(stagingHtml));
assert.ok(/hide\('fireSDesktopAccess'\)/.test(read('staging/fire-s-clean-home-roles.js')));

assert.ok(/body\.fire-s-entitlement-blocked #projectListSection/.test(stagingCss));
assert.ok(/display: none !important/.test(stagingCss));
assert.ok(/fire-s-entitlement\.js\?v=1-3-111-noshock/.test(stagingHtml));
assert.ok(/fire-s-entitlement\.css\?v=1-3-107-lock/.test(stagingHtml));
assert.ok(/#fireSOwnerLists/.test(stagingCss));
assert.ok(/fire-s-home-lock-panel/.test(stagingCss));
assert.ok(/app\.js\?v=1-3-112-feedback/.test(stagingHtml));
assert.ok(/Version 1\.3\.112-toets/.test(stagingHtml));
assert.ok(/Version 1\.3\.67/.test(liveHtml));
assert.ok(/inspectionAccessLocked/.test(liveApp), 'live openProject must lock unpaid inspections');
assert.ok(/inspectionAccessLocked\(\)/.test(stagingApp));
assert.ok(/fireSEntitlementGate\('read'\)/.test(stagingApp));
assert.ok(/They stay locked in the app until a new subscription is active/.test(stagingHtml));

const testExpirySql = read('SUPABASE_test_cancelled_expiry_past.sql');
assert.ok(/now\(\) - interval '1 day'/.test(testExpirySql));
assert.ok(/s\.status = 'cancelled'/.test(testExpirySql));
assert.ok(/fire_s_refresh_entitlement_status/.test(testExpirySql));
assert.ok(/block_is_on/.test(testExpirySql));
assert.ok(/keep_data/.test(testExpirySql));
assert.ok(/SUPABASE_restore_cancelled_expiry\.sql/.test(testExpirySql), 'test shortcut must name the restore file');
assert.ok(/Do not run on live/.test(testExpirySql));
assert.ok(!/delete from public\.inspections/.test(testExpirySql));

const restoreExpirySql = read('SUPABASE_restore_cancelled_expiry.sql');
assert.ok(/last_payment_at/.test(restoreExpirySql), 'restore must use the last successful payment');
assert.ok(/interval '1 month'/.test(restoreExpirySql));
assert.ok(/interval '1 year'/.test(restoreExpirySql));
assert.ok(/subscription_paid_through/.test(restoreExpirySql));
assert.ok(/fire_s_refresh_entitlement_status/.test(restoreExpirySql));
assert.ok(/inspections_locked/.test(restoreExpirySql));
assert.ok(/keep_data/.test(restoreExpirySql));
assert.ok(/Do not run on live/.test(restoreExpirySql));
assert.ok(/SUPABASE_test_cancelled_expiry_past\.sql/.test(restoreExpirySql));
assert.ok(!/now\(\) - interval '1 day'/.test(restoreExpirySql), 'restore must not keep the yesterday shortcut');
assert.ok(!/delete from public\.inspections/.test(restoreExpirySql));
assert.ok(/fire_s_cancel_keeps_access\(\)/.test(compute), 'paid-through access is only when the keep-access flag is on');
assert.ok(
  /v_sub_status = 'cancelled'\s+and public\.fire_s_cancel_keeps_access\(\)\s+and v_access is not null\s+and v_now < v_access then/s.test(compute),
  'default cancel must lock inspections even before the paid-through date'
);

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
      insertBefore: function () {},
      after: function () {},
      firstChild: null,
      setAttribute: function () {},
      removeAttribute: function () {},
      parentNode: {
        after: function () {},
        insertBefore: function () {}
      },
      closest: function (sel) {
        if (sel === '#' + id) return nodes[id];
        return null;
      },
      classList: { add: function () {}, toggle: function () {}, contains: function () { return false; } }
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
    setTimeout: function () { return 0; },
    setInterval: function () { return 0; },
    clearInterval: function () {},
    __openedInspections: 0,
    openInspectionsCommand: function () { sandbox.__openedInspections += 1; },
    openGateway: function () { sandbox.__openedInspections += 1; }
  };
  sandbox.window = sandbox;
  sandbox.currentUserProfile = {
    id: 'u1',
    email: 'a@b.c',
    companyId: 'co1',
    role: 'company_owner'
  };
  vm.runInNewContext(stagingEntitlement, sandbox);
  sandbox.__nodes = nodes;
  return sandbox;
}

const ent = loadEntitlement();
const cancelled = ent.fireSEntitlement.displayCopy({
  status: 'subscription_cancelled',
  reason: 'subscription_required',
  allowed: false,
  can_read: false,
  can_create: false,
  keep_data: true,
  backendReady: true
});
assert.strictEqual(cancelled.urgency, 'block');
assert.ok(/cloud/i.test(cancelled.detail));
assert.ok(/locked until a new subscription is active/i.test(cancelled.detail));

const oldPaidThroughCopy = ent.fireSEntitlement.displayCopy({
  status: 'subscription_cancelled',
  reason: 'cancelled_until_period_end',
  allowed: true,
  can_read: true,
  backendReady: true
});
assert.strictEqual(oldPaidThroughCopy.urgency, 'block', 'cancelled companies stay locked until a new subscription is active');
assert.ok(/locked until a new subscription is active/i.test(oldPaidThroughCopy.detail));
assert.strictEqual(
  ent.fireSEntitlement.inspectionAccessLocked(),
  false,
  'paid Home must not flash the red lock while the entitlement RPC is still loading'
);
assert.strictEqual(ent.fireSEntitlement.homeWorkAllowed(), true);

(async function runCancelledRpc() {
  const client = loadEntitlement();
  client.supabaseClient = {
    rpc: async function () {
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
          super_admin: false,
          backendReady: true
        }
      };
    }
  };
  const info = await client.fireSEntitlement.getCompanyEntitlement('co1');
  assert.strictEqual(info.keep_data, true);
  assert.strictEqual(info.can_read, false);
  assert.strictEqual(client.fireSEntitlement.canRead(), false);
  assert.strictEqual(client.fireSEntitlement.canExport(), false);
  assert.strictEqual(client.fireSEntitlement.inspectionAccessLocked(), true);
  assert.strictEqual(client.fireSEntitlement.operationallyAllowed(), false);
  assert.strictEqual(client.fireSEntitlement.isAllowedLockedTarget({ closest: function (sel) { return sel === '#cmdInspectionsBtn' ? {} : null; } }), false);
  assert.strictEqual(client.fireSEntitlement.isAllowedLockedTarget({ closest: function (sel) { return sel === '#cmdSubscribeBtn' ? {} : null; } }), true);
  client.__openedInspections = 0;
  client.openInspectionsCommand();
  client.openGateway();
  assert.strictEqual(client.__openedInspections, 0, 'Gateway / Inspections must stay on Home after expiry');
  client.fireSEntitlement.pinLockedHome();
  assert.strictEqual(client.__nodes.homeSection.hidden, false, 'locked users stay on Home');
  assert.strictEqual(client.__nodes.projectFormSection.hidden, true, 'inspection form stays closed');
  assert.strictEqual(client.__nodes.projectListSection.hidden, true, 'inspection list stays closed');
  assert.ok(client.__nodes.fireSHomeLockPanel && client.__nodes.fireSHomeLockPanel.hidden === false);
  assert.strictEqual(client.__nodes.cmdInspectionsBtn.hidden, true, 'Inspection Gateway stays off Home after expiry');
  assert.strictEqual(client.__nodes.cmdSubscribeBtn.hidden, false, 'Subscribe stays on Home');

  const overlayClient = loadEntitlement();
  overlayClient.supabaseClient = {
    rpc: async function () {
      return {
        data: {
          allowed: false,
          can_create: false,
          can_finalise: false,
          can_write_draft: true,
          can_read: true,
          can_export: true,
          keep_data: true,
          authority: 'server',
          status: 'subscription_cancelled',
          reason: 'subscription_required',
          super_admin: false,
          backendReady: true
        }
      };
    }
  };
  await overlayClient.fireSEntitlement.getCompanyEntitlement('co1');
  assert.strictEqual(
    overlayClient.fireSEntitlement.inspectionAccessLocked(),
    true,
    'Subscription required must lock inspection buttons even if can_read is still true'
  );

  const paidThroughClient = loadEntitlement();
  paidThroughClient.supabaseClient = {
    rpc: async function () {
      return {
        data: {
          allowed: true,
          can_create: true,
          can_finalise: true,
          can_write_draft: true,
          can_read: true,
          can_export: true,
          keep_data: true,
          authority: 'server',
          status: 'subscription_cancelled',
          reason: 'cancelled_until_period_end',
          super_admin: false,
          backendReady: true
        }
      };
    }
  };
  await paidThroughClient.fireSEntitlement.getCompanyEntitlement('co1');
  assert.strictEqual(
    paidThroughClient.fireSEntitlement.inspectionAccessLocked(),
    true,
    'cancelled companies stay locked until a new subscription is active'
  );
  assert.strictEqual(paidThroughClient.fireSEntitlement.canRead(), false);
  assert.strictEqual(paidThroughClient.fireSEntitlement.operationallyAllowed(), false);

  client.currentUserProfile.role = 'super_admin';
  client.isSuperAdmin = function () { return true; };
  assert.strictEqual(client.fireSEntitlement.canRead(), true, 'super_admin still opens inspections');
  assert.strictEqual(client.fireSEntitlement.inspectionAccessLocked(), false);

  console.log('cancel-lock-inspections.test.js: ok');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
