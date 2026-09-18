'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('staging/app.js');
const html = read('staging/index.html');
const liveApp = read('app.js');
const liveHtml = read('index.html');
const start = app.indexOf('(function installFireSDataManagementV12(){');
const end = app.indexOf('window.fireSPurgeExpiredRecycleAutomatically');
assert.ok(start >= 0 && end > start, 'Data Management panel must exist');
const panel = app.slice(start, end);

assert.ok(
  /function projectsStorageKey\(/.test(panel) &&
    /localStorage.getItem\(projectsStorageKey\(\)\)/.test(panel) &&
    /localStorage.setItem\(projectsStorageKey\(\), JSON.stringify\(projects\)\)/.test(panel),
  'Delete buttons must read and write fireyeProjects-staging on toets, not live fireyeProjects'
);
assert.ok(
  !/getItem\('fireyeProjects'\)/.test(panel) &&
    !/setItem\('fireyeProjects'/.test(panel),
  'Data Management must not hard-code the live projects key'
);
assert.ok(
  /Recycle Bin \(30 days\)/.test(panel) &&
    /Delete immediately/.test(panel),
  'Each delete must offer Recycle Bin or Delete immediately'
);
assert.ok(
  /mode === 'immediate'/.test(panel) &&
    /immediate_delete_current_inspection/.test(panel) &&
    /immediate_delete_history_inspection/.test(panel) &&
    /immediate_delete_entire_premises/.test(panel),
  'Immediate delete must skip the Recycle Bin'
);
assert.ok(
  /async function purgeExpiredRecycleAutomatically\(/.test(panel) &&
    /deleted automatically/.test(panel),
  'Recycle Bin items must be purged automatically after 30 days'
);
assert.ok(
  /restoreRecycleId \|\| button.dataset.recycleId/.test(panel),
  'Recycle restore must read the restore button id'
);
assert.ok(
  /z-index:60050/.test(panel),
  'Data Management must sit above Command Centre so its buttons receive taps'
);
assert.ok(
  /delete-data-management-v16/.test(panel) &&
    /function wireChoice\(/.test(panel),
  'Delete confirm panels must wire Recycle and Immediate actions'
);
assert.ok(
  /app\.js\?v=1-3-91-toets-lock/.test(html) &&
    /Version 1\.3\.91-toets/.test(html),
  'Toets must cache-bust Data Management delete without bumping the displayed version'
);
assert.ok(
  /Recycle Bin \(30 days\)/.test(liveApp) &&
    /Delete immediately/.test(liveApp) &&
    /async function purgeExpiredRecycleAutomatically\(/.test(liveApp) &&
    /delete-data-management-v16/.test(liveApp) &&
    /app\.js\?v=1-3-65-count/.test(liveHtml) &&
    /Version 1\.3\.65/.test(liveHtml),
  'Live Data Management must offer Recycle Bin or Delete immediately without bumping 1.3.65'
);

function fakeEl() {
  return {
    id: '',
    className: '',
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    children: [],
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    appendChild(node) { this.children.push(node); return node; },
    remove() {},
    classList: { add() {}, remove() {}, contains() { return false; } }
  };
}

async function runDeleteChoiceRuntime() {
  const store = Object.create(null);
  const localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    }
  };

  localStorage.setItem('fireyeProjects-staging', JSON.stringify([
    {
      id: 'p-current',
      organisationName: 'Alpha Hall',
      siteName: 'Main Gate',
      companyId: 'co-1',
      currentInspectionId: 'insp-1',
      inspectionNumber: 'FS-100',
      inspectionDate: '2026-09-01',
      answers: [{ q: '1' }],
      inspectionHistory: []
    },
    {
      id: 'p-history',
      organisationName: 'Beta Hall',
      siteName: 'Dock',
      companyId: 'co-1',
      inspectionHistory: [{ inspectionNumber: 'FS-200', inspectionDate: '2026-08-01' }]
    },
    {
      id: 'p-expired',
      organisationName: 'Old Hall',
      siteName: 'Yard',
      companyId: 'co-1',
      deletedAt: '2026-01-01T00:00:00.000Z',
      dataManagementDeletedAt: '2026-01-01T00:00:00.000Z',
      deletePurgeAfter: '2026-02-01T00:00:00.000Z',
      deleteType: 'entire_premises'
    },
    {
      id: 'p-expired-current',
      organisationName: 'Gamma Hall',
      siteName: 'Wing',
      companyId: 'co-1',
      recycleBin: {
        currentInspections: [{
          recycleId: 'old-current',
          deletedAt: '2026-01-01T00:00:00.000Z',
          purgeAfter: '2026-02-01T00:00:00.000Z',
          snapshot: { inspectionNumber: 'FS-9' }
        }],
        historyInspections: []
      }
    }
  ]));
  localStorage.setItem('fireyeProjects', JSON.stringify([{ id: 'live-must-not-change' }]));

  const windowObj = {
    FIRE_S_ENV: { isStaging: true },
    setTimeout() { return 0; },
    addEventListener() {},
    currentProjectPage: 1
  };
  const context = {
    window: windowObj,
    document: {
      readyState: 'complete',
      documentElement: fakeEl(),
      body: fakeEl(),
      head: fakeEl(),
      getElementById() { return null; },
      createElement() { return fakeEl(); },
      querySelector() { return null; },
      addEventListener() {}
    },
    localStorage,
    currentUserProfile: {
      id: 'admin-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      role: 'company_admin',
      companyId: 'co-1'
    },
    currentProjectPage: 1,
    fireSProjectsStorageKey() { return 'fireyeProjects-staging'; },
    fireSDeletedProjectIdsStorageKey() { return 'fireyeDeletedProjectIds-staging'; },
    setProjects(projects) {
      localStorage.setItem('fireyeProjects-staging', JSON.stringify(projects));
    },
    getProjects() {
      return JSON.parse(localStorage.getItem('fireyeProjects-staging') || '[]');
    },
    getDeletedProjectIds() { return {}; },
    markProjectDeleted() {},
    hasCurrentIncompleteInspection(project) {
      return !!(project && project.currentInspectionId);
    },
    resolveFireSHomeRole() { return 'company_admin'; },
    getCurrentUserRole() { return 'company_admin'; },
    isSuperAdmin() { return false; },
    MutationObserver: class { observe() {} },
    Element: function Element() {},
    alert() {},
    setTimeout() { return 0; },
    Promise,
    JSON,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    console
  };
  context.window = Object.assign(windowObj, context);
  context.global = context;
  context.globalThis = context;

  const iifeEnd = app.indexOf('})();\n\n/* =====================================================\n   FIRE-S appearance choice');
  assert.ok(iifeEnd > start, 'Data Management IIFE must close before appearance choice');
  vm.runInNewContext(app.slice(start, iifeEnd + 4), context);

  const api = context.window.FireSDataManagementV12;
  assert.ok(api && api.deleteCurrentInspection, 'Data Management API must export delete helpers');

  const auto = await api.purgeExpiredRecycleAutomatically();
  assert.ok(auto.purged >= 2, 'Expired Recycle Bin items must be deleted automatically');
  const afterPurge = JSON.parse(store['fireyeProjects-staging']);
  assert.ok(!afterPurge.some(p => p.id === 'p-expired'), 'Expired premises must leave storage without a tap');
  const gamma = afterPurge.find(p => p.id === 'p-expired-current');
  assert.strictEqual(
    gamma.recycleBin.currentInspections.length,
    0,
    'Expired current-inspection snapshots must be purged automatically'
  );

  assert.strictEqual(
    api.deleteCurrentInspection('p-current', 'recycle'),
    true,
    'Recycle must accept an incomplete inspection delete'
  );
  let projects = JSON.parse(store['fireyeProjects-staging']);
  let recycled = projects.find(p => p.id === 'p-current');
  assert.ok(!recycled.currentInspectionId, 'Recycle must clear the current inspection');
  assert.strictEqual(recycled.recycleBin.currentInspections.length, 1, 'Recycle must keep a 30-day snapshot');
  assert.ok(
    new Date(recycled.recycleBin.currentInspections[0].purgeAfter).getTime() > Date.now(),
    'Recycle snapshots must expire after 30 days'
  );

  recycled.currentInspectionId = 'insp-2';
  recycled.inspectionNumber = 'FS-101';
  localStorage.setItem('fireyeProjects-staging', JSON.stringify(projects));
  assert.strictEqual(
    api.deleteCurrentInspection('p-current', 'immediate'),
    true,
    'Immediate must accept an incomplete inspection delete'
  );
  projects = JSON.parse(store['fireyeProjects-staging']);
  recycled = projects.find(p => p.id === 'p-current');
  assert.strictEqual(
    recycled.recycleBin.currentInspections.length,
    1,
    'Immediate delete must skip the Recycle Bin'
  );

  assert.strictEqual(
    api.deleteHistoryInspection('p-history', 0, 'immediate'),
    true,
    'Immediate must accept a History delete'
  );
  projects = JSON.parse(store['fireyeProjects-staging']);
  const historyProject = projects.find(p => p.id === 'p-history');
  assert.strictEqual(historyProject.inspectionHistory.length, 0, 'Immediate History delete must remove the record');
  assert.strictEqual(
    (historyProject.recycleBin.historyInspections || []).length,
    0,
    'Immediate History delete must not land in the Recycle Bin'
  );

  assert.strictEqual(
    store.fireyeProjects,
    JSON.stringify([{ id: 'live-must-not-change' }]),
    'Toets deletes must not write the live fireyeProjects key'
  );
}

runDeleteChoiceRuntime().then(() => {
  console.log('data-management-delete-choice.test.js: ok');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
