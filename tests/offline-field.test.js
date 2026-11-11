'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const sw = read('staging/service-worker.js');
const app = read('staging/app.js');
const entitlement = read('staging/fire-s-entitlement.js');

assert.ok(/const CACHE = 'fire-s-108-84-toets-130'/.test(sw));
assert.ok(/'\.\/index\.html\?toets=130'/.test(sw), 'the field page must be stored for an offline reopen');
assert.ok(/'\.\/checklists\.json'/.test(sw), 'checklist data must be stored for site work');
assert.ok(/cache: 'no-store'/.test(sw), 'an online open still fetches a fresh copy');
assert.ok(sw.indexOf('/\\.css$/i.test(path)') !== -1);
assert.ok(!/client\.navigate\(/.test(sw), 'the service worker must not reload an open inspection');

const dropAt = html.indexOf('fireS.toetsCacheDrop.1-3-130');
const keepCopyAt = html.indexOf('Keep the phone copy for site work');
const registrationsAt = html.indexOf('serviceWorker.getRegistrations');
assert.ok(dropAt !== -1 && keepCopyAt !== -1 && keepCopyAt < registrationsAt,
  'after the one-time drop, opening the app must not wipe the offline copy');
assert.ok(/getItem\(FLAG\) === WANT\) \{\s*goFresh\(false\);\s*return;/s.test(html));
assert.ok(/location\.href\)\.indexOf\(scope\)/.test(html));
assert.ok(/searchParams\.set\('toets', '130'\)/.test(html));

assert.ok(/async function readFieldJson\(/.test(app));
assert.ok(/navigator\.onLine === false/.test(app));
assert.ok(/v=manual-sprint-202b-/.test(app), 'online checklist loads still bypass a stale browser cache');
assert.ok(/rememberFieldJson\(url, text\)/.test(app));

assert.ok(/must not GRANT access from localStorage/.test(entitlement));
assert.ok(/if \(!info \|\| !info\.backendReady\) \{\s*return deny\('subscription_required'\)/s.test(entitlement));
assert.ok(/source === 'offline-replay'/.test(entitlement));
assert.ok(/navigator\.onLine === false/.test(entitlement));

function bootEntitlement(store, online) {
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
    navigator: { onLine: online },
    location: { hash: '', search: '', href: 'https://example.test/staging/?toets=130' },
    document: {
      readyState: 'complete',
      addEventListener: function () {},
      getElementById: fakeEl,
      body: { classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } }, appendChild: function () {} },
      documentElement: { classList: { add: function () {}, remove: function () {}, contains: function () { return false; } } },
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
  sandbox.currentUserProfile = {
    id: 'u1',
    email: 'inspector@example.test',
    companyId: 'co1',
    role: 'inspector'
  };
  vm.runInNewContext(entitlement, sandbox);
  return sandbox;
}

(async function run() {
  const idleStore = {};
  idleStore['fireS.billingStatus'] = 'active';
  idleStore['fireS.entitlement'] = JSON.stringify({ allowed: true, can_create: true, authority: 'server', backendReady: true });
  const idle = bootEntitlement(idleStore, true);
  assert.strictEqual(idle.fireSEntitlement.hasSnapshot(), false, 'a stored flag must not unlock before the server answers');
  assert.strictEqual(idle.fireSEntitlement.canCreate(), false);

  const offlineStore = {};
  offlineStore['fireS.entitlementOfflineReplay'] = JSON.stringify({
    userId: 'u1',
    companyId: 'co1',
    snapshot: {
      allowed: true,
      can_create: true,
      can_finalise: true,
      can_read: true,
      can_write_draft: true,
      can_export: true,
      keep_data: true,
      status: 'subscription_active',
      reason: '',
      authority: 'server',
      backendReady: true
    }
  });
  const offline = bootEntitlement(offlineStore, false);
  assert.strictEqual(offline.fireSEntitlement.hasSnapshot(), false, 'opening offline must not unlock until the saved server answer is read');
  offline.supabaseClient = {
    rpc: async function () {
      throw new Error('Failed to fetch');
    }
  };
  const info = await offline.getCompanyEntitlement('co1');
  assert.strictEqual(info.source, 'offline-replay');
  assert.strictEqual(info.allowed, true);
  assert.strictEqual(info.authority, 'server');
  assert.strictEqual(offline.fireSEntitlement.canCreate(), true, 'a signed-in inspector can keep working offline');
  assert.strictEqual(offline.fireSEntitlement.canFinalise(), true);
  assert.strictEqual(offline.fireSEntitlement.inspectionAccessLocked(), false);

  const online = bootEntitlement(offlineStore, true);
  online.supabaseClient = {
    rpc: async function (name) {
      assert.ok(name === 'fire_s_get_company_entitlement' || name === 'fire_s_check_company_entitlement');
      return {
        data: {
          allowed: false,
          can_create: false,
          can_finalise: false,
          can_read: false,
          can_export: false,
          can_write_draft: false,
          keep_data: true,
          authority: 'server',
          status: 'subscription_cancelled',
          reason: 'subscription_required',
          backendReady: true
        }
      };
    },
    from: function () {
      return { select: function () { return this; }, eq: function () { return this; }, maybeSingle: async function () { return { data: null }; } };
    }
  };
  const denied = await online.getCompanyEntitlement('co1');
  assert.strictEqual(denied.allowed, false, 'signal restored must take the server answer');
  assert.strictEqual(online.fireSEntitlement.canCreate(), false);

  const locked = bootEntitlement(offlineStore, false);
  locked.supabaseClient = online.supabaseClient;
  const stillDenied = await locked.getCompanyEntitlement('co1');
  assert.strictEqual(stillDenied.allowed, false, 'a cancelled company stays locked offline');
  assert.strictEqual(locked.fireSEntitlement.inspectionAccessLocked(), true);

  console.log('offline-field.test.js: ok');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
