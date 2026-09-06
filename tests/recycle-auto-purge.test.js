'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('staging/app.js');
const liveApp = read('app.js');
const env = read('staging/fire-s-env.js');
const html = read('staging/index.html');
const liveEnv = read('fire-s-env.js');

assert.ok(/1\.3\.62-toets/.test(env), 'Toets-blad version must be 1.3.62-toets');
assert.ok(
  /app\.js\?v=1-3-62-recycle/.test(html) &&
    /fire-s-env\.js\?v=1-3-62-toets/.test(html),
  'Toets-blad must cache-bust the recycle auto-purge files'
);
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.55'/.test(liveEnv),
  'Live Fire-S must stay on 1.3.55 until this is sat live'
);

assert.ok(
  /delete-data-management-v15/.test(app) &&
    /function isRetentionExpired\(item\)/.test(app) &&
    /function purgeExpiredRecycleEntries\(\)/.test(app) &&
    /await purgeExpiredRecycleEntries\(\)/.test(app) &&
    /scheduleExpiredRecyclePurge\(\)/.test(app),
  'Toets Recycle Bin must auto-purge expired inspections on day 0'
);
assert.ok(
  /On day 0 the item is deleted automatically/.test(app) &&
    /The owner may permanently delete it immediately/.test(app) &&
    /Owner may delete immediately/.test(app),
  'Toets Recycle Bin copy must explain automatic day-0 delete and owner immediate delete'
);
assert.ok(
  /currentRole === 'company_owner'/.test(app) &&
    /typeof isCompanyOwner === 'function' && isCompanyOwner\(\)/.test(app),
  'Owner must be allowed to permanently delete immediately'
);
assert.ok(
  /!automatic && !canPurgeBeforeExpiry\(\)/.test(app),
  'Manual permanent delete must stay owner-only; day-0 purge is automatic'
);
assert.ok(
  !/After expiry, a Company Admin or Super Admin may permanently delete the item/.test(app),
  'Toets Recycle Bin must not ask an admin to delete expired inspections by hand'
);

assert.ok(
  /After expiry, a Company Admin or Super Admin may permanently delete the item/.test(liveApp) &&
    /Only the Super Admin may permanently delete it before expiry/.test(liveApp) &&
    !/function isRetentionExpired\(item\)/.test(liveApp) &&
    !/function purgeExpiredRecycleEntries\(\)/.test(liveApp),
  'Live Recycle Bin must keep the current manual expiry delete until this is sat live'
);

const start = app.indexOf('(function installFireSDataManagementV12(){');
const end = app.indexOf('})();', app.lastIndexOf('window.FireSDataManagementV12'));
assert.ok(start >= 0 && end > start, 'Data management installer must be present');
const installer = app.slice(start, end + 5);

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeElement() {
  return {
    id: '',
    style: {},
    className: '',
    textContent: '',
    innerHTML: '',
    dataset: {},
    hidden: false,
    children: [],
    setAttribute() {},
    getAttribute() { return null; },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    remove() {}
  };
}

function loadManager(projects, roleName) {
  const store = {
    fireyeProjects: JSON.stringify(projects),
    fireSDataManagementAuditV12: '[]'
  };
  const body = makeElement();
  const head = makeElement();
  const document = {
    readyState: 'complete',
    documentElement: body,
    body,
    head,
    getElementById() { return null; },
    createElement() { return makeElement(); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Array,
    String,
    Number,
    Object,
    Promise,
    Set,
    Error,
    setTimeout,
    clearTimeout,
    alert() {},
    confirm() { return false; },
    prompt() { return null; },
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); },
      removeItem(key) { delete store[key]; }
    },
    document,
    window: {
      setTimeout,
      clearTimeout,
      addEventListener() {},
      FireSDataManagementV12: null
    },
    currentUserProfile: {
      id: 'owner-1',
      email: 'owner@example.com',
      fullName: 'Test Owner',
      role: roleName,
      companyId: 'co-1'
    },
    getCurrentUserRole() { return roleName; },
    isSuperAdmin() { return roleName === 'super_admin'; },
    isCompanyOwner() { return roleName === 'company_owner' || roleName === 'owner'; },
    store
  };
  sandbox.window.document = document;
  sandbox.global = sandbox;
  vm.runInNewContext(installer, sandbox, { timeout: 3000 });
  return sandbox;
}

function readProjects(sandbox) {
  return JSON.parse(sandbox.store.fireyeProjects || '[]');
}

const seed = [
  {
    id: 'keep-live',
    organisationName: 'Keep Live',
    companyId: 'co-1',
    recycleBin: {
      currentInspections: [{
        recycleId: 'keep-current',
        inspectionLabel: 'Still recoverable',
        deletedAt: isoDaysAgo(2),
        purgeAfter: isoDaysAgo(-10)
      }],
      historyInspections: [{
        recycleId: 'keep-history',
        inspectionLabel: 'History still recoverable',
        deletedAt: isoDaysAgo(1),
        snapshot: { inspectionNumber: 'FS-KEEP' },
        purgeAfter: isoDaysAgo(-20)
      }]
    }
  },
  {
    id: 'expired-inspections',
    organisationName: 'Expired Work',
    companyId: 'co-1',
    recycleBin: {
      currentInspections: [{
        recycleId: 'gone-current',
        inspectionLabel: 'Day zero current',
        deletedAt: isoDaysAgo(31),
        purgeAfter: isoDaysAgo(1)
      }],
      historyInspections: [{
        recycleId: 'gone-history',
        inspectionLabel: 'Day zero history',
        deletedAt: isoDaysAgo(40),
        snapshot: { inspectionNumber: 'FS-GONE' },
        purgeAfter: isoDaysAgo(0.5)
      }]
    }
  }
];

(async function run() {
  const ownerBox = loadManager(seed, 'company_owner');
  const api = ownerBox.window.FireSDataManagementV12;
  assert.ok(api && typeof api.purgeExpiredRecycleEntries === 'function', 'API must expose auto-purge');
  assert.strictEqual(api.canPurgeBeforeExpiry(), true, 'Company owner may delete immediately');
  assert.strictEqual(
    api.isRetentionExpired({ purgeAfter: isoDaysAgo(1) }),
    true,
    'Yesterday purgeAfter is day 0 / expired'
  );
  assert.strictEqual(
    api.isRetentionExpired({ purgeAfter: isoDaysAgo(-5) }),
    false,
    'Future purgeAfter must stay recoverable'
  );

  await api.purgeExpiredRecycleEntries();
  const after = readProjects(ownerBox);
  const kept = after.find(project => project.id === 'keep-live');
  const expired = after.find(project => project.id === 'expired-inspections');
  assert.ok(kept, 'Recoverable premises must stay');
  assert.strictEqual(kept.recycleBin.currentInspections.length, 1, 'Recoverable current inspection must stay');
  assert.strictEqual(kept.recycleBin.historyInspections.length, 1, 'Recoverable history inspection must stay');
  assert.strictEqual(
    expired.recycleBin.currentInspections.length,
    0,
    'Expired current inspection must delete automatically on day 0'
  );
  assert.strictEqual(
    expired.recycleBin.historyInspections.length,
    0,
    'Expired history inspection must delete automatically on day 0'
  );
  assert.ok(
    (expired.dataManagementAudit || []).some(entry => entry.action === 'auto_purge_current_inspection'),
    'Automatic current-inspection purge must be audited'
  );
  assert.ok(
    (expired.dataManagementAudit || []).some(entry => entry.action === 'auto_purge_history_inspection'),
    'Automatic history-inspection purge must be audited'
  );

  const inspectorBox = loadManager(seed, 'inspector');
  const inspectorApi = inspectorBox.window.FireSDataManagementV12;
  assert.strictEqual(
    inspectorApi.canPurgeBeforeExpiry(),
    false,
    'Inspector must not permanently delete immediately'
  );
  const blocked = await inspectorApi.permanentlyDeleteRecycleEntry(
    'current',
    'keep-live',
    'keep-current'
  );
  assert.strictEqual(blocked, false, 'Inspector must not skip the 30-day window');
  const inspectorProjects = readProjects(inspectorBox);
  const inspectorKept = inspectorProjects.find(project => project.id === 'keep-live');
  assert.strictEqual(
    inspectorKept.recycleBin.currentInspections.some(item => item.recycleId === 'keep-current'),
    true,
    'Recoverable inspection must remain until day 0 or owner immediate delete'
  );

  const ownerImmediate = await api.permanentlyDeleteRecycleEntry(
    'current',
    'keep-live',
    'keep-current'
  );
  assert.strictEqual(ownerImmediate, true, 'Owner may permanently delete immediately');
  const afterOwner = readProjects(ownerBox);
  const ownerKept = afterOwner.find(project => project.id === 'keep-live');
  assert.strictEqual(
    ownerKept.recycleBin.currentInspections.length,
    0,
    'Owner immediate delete must remove the recoverable current inspection'
  );

  console.log('recycle-auto-purge.test.js: ok');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
