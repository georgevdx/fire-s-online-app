'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const entitlement = read('staging/fire-s-entitlement.js');
const env = read('staging/fire-s-env.js');

assert.ok(/function staffMustSignOut\(/.test(entitlement));
assert.ok(/function enforceStaffSignOut\(/.test(entitlement));
assert.ok(/function isPayingOwner\(/.test(entitlement));
assert.ok(/logoutUser/.test(entitlement), 'cancelled staff must be signed out');
assert.ok(/You stay signed out until then/.test(entitlement));
assert.ok(/1\.3\.119-toets/.test(env), 'Toets-blad version must be 1.3.119-toets');

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
      closest: function (sel) {
        if (sel === '#' + id) return nodes[id];
        return null;
      },
      classList: { add: function () {}, toggle: function () {}, contains: function () { return false; } },
      setAttribute: function () {},
      removeAttribute: function () {},
      hasAttribute: function () { return false; }
    };
  }
  return nodes[id];
}

function load(role, entitlementData) {
  const nodes = {};
  let signedOut = 0;
  const sandbox = {
    window: {
      currentUserProfile: {
        id: 'user-1',
        email: role + '@example.test',
        companyId: 'co1',
        role: role
      }
    },
    location: { hash: '', search: '', href: 'https://example.test/staging/' },
    document: {
      readyState: 'complete',
      addEventListener: function () {},
      getElementById: function (id) {
        return fakeEl(id, nodes);
      },
      querySelector: function () {
        return null;
      },
      body: {
        classList: { add: function () {}, toggle: function () {}, contains: function () { return false; } },
        appendChild: function () {}
      },
      documentElement: { classList: { add: function () {}, toggle: function () {}, contains: function () { return false; } } },
      createElement: function () {
        return { id: '', className: '', hidden: true, innerHTML: '', addEventListener: function () {}, style: {} };
      }
    },
    console: console,
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    alert: function () {},
    setTimeout: function () { return 0; }
  };
  sandbox.window = sandbox;
  sandbox.currentUserProfile = {
    id: 'user-1',
    email: role + '@example.test',
    companyId: 'co1',
    role: role
  };
  sandbox.logoutUser = function () {
    signedOut += 1;
  };
  sandbox.supabaseClient = {
    rpc: async function () {
      return {
        data: entitlementData || {
          status: 'subscription_cancelled',
          reason: 'subscription_cancelled',
          allowed: false,
          can_read: false,
          can_create: false,
          keep_data: true
        }
      };
    }
  };
  vm.runInNewContext(entitlement, sandbox);
  sandbox.__signedOut = function () {
    return signedOut;
  };
  return sandbox;
}

(async function run() {
  const inspector = load('inspector');
  await inspector.fireSEntitlement.refresh(true);
  await Promise.resolve();
  assert.strictEqual(inspector.fireSEntitlement.staffMustSignOut(), false, 'inspector follows the owner cancellation and stays signed in');
  assert.strictEqual(inspector.__signedOut(), 0, 'inspector is not logged out when the company is cancelled');
  assert.strictEqual(inspector.fireSEntitlement.inspectionAccessLocked(), true, 'inspector inspections lock with the owner cancellation');

  const manager = load('manager');
  await manager.fireSEntitlement.refresh(true);
  await Promise.resolve();
  assert.strictEqual(manager.fireSEntitlement.staffMustSignOut(), false, 'manager follows the owner cancellation and stays signed in');
  assert.strictEqual(manager.__signedOut(), 0, 'manager is not logged out when the company is cancelled');
  assert.strictEqual(manager.fireSEntitlement.inspectionAccessLocked(), true, 'manager inspections lock with the owner cancellation');

  const owner = load('company_owner');
  await owner.fireSEntitlement.refresh(true);
  await Promise.resolve();
  assert.strictEqual(owner.fireSEntitlement.staffMustSignOut(), false, 'Owner stays signed in to pay on PayFast');
  assert.strictEqual(owner.__signedOut(), 0, 'Owner is not logged out');
  assert.strictEqual(owner.fireSEntitlement.inspectionAccessLocked(), true, 'Owner inspections lock on the same cancellation');

  const openInspector = load('inspector', {
    status: 'subscription_cancelled',
    reason: 'cancelled_until_period_end',
    allowed: true,
    can_read: true,
    can_create: true,
    can_finalise: true,
    keep_data: true,
    access_until: '2099-01-01T00:00:00.000Z'
  });
  await openInspector.fireSEntitlement.refresh(true);
  await Promise.resolve();
  assert.strictEqual(openInspector.fireSEntitlement.staffMustSignOut(), false, 'inspector stays signed in during the paid-through window');
  assert.strictEqual(openInspector.__signedOut(), 0, 'inspector is not logged out while the cancelled company is still open');
  assert.strictEqual(openInspector.fireSEntitlement.inspectionAccessLocked(), false, 'inspector keeps the same open window as the owner');
  assert.strictEqual(openInspector.fireSEntitlement.paidWindowOpen(), true, 'paid-through window is the owner cancellation route');

  const admin = load('super_admin');
  await admin.fireSEntitlement.refresh(true);
  await Promise.resolve();
  assert.strictEqual(admin.fireSEntitlement.staffMustSignOut(), false, 'Super Admin stays signed in');
  assert.strictEqual(admin.__signedOut(), 0, 'Super Admin is not logged out');

  console.log('staff-cancel-signout.test.js: ok');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
