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
const start = app.indexOf('(function installFireSCompanyDataAuditV16(){');
const end = app.indexOf('// Fire-S v11: require an explicit confirmation');
assert.ok(start >= 0 && end > start, 'Company Data Audit Log must exist on toets');
const panel = app.slice(start, end);

assert.ok(
  /function clearCompanyAudit\(/.test(panel) &&
    /Clear Data Audit Log/.test(panel) &&
    /Inspections and premises are not deleted/.test(panel) &&
    /fireSDataManagementAuditV12-staging/.test(panel) &&
    !/getItem\('fireyeProjects'\)/.test(panel),
  'Clear must remove the toets audit log without reading the live projects key'
);
assert.ok(
  !/function clearCompanyAudit\(/.test(liveApp),
  'Clear stays on the toets-blad until it is sat live'
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

function runClear(confirmResult) {
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
  const ours = {
    id: 'audit-ours',
    action: 'delete_history_inspection',
    recordedAt: '2026-11-01T10:00:00.000Z',
    projectId: 'p-ours',
    premises: 'Alpha Hall — Main Gate',
    companyId: 'co-1',
    actor: { name: 'Owner', role: 'company_admin' }
  };
  const other = {
    id: 'audit-other',
    action: 'delete_entire_premises',
    recordedAt: '2026-11-02T10:00:00.000Z',
    projectId: 'p-other',
    premises: 'Other Hall — Yard',
    companyId: 'co-2',
    actor: { name: 'Other', role: 'company_admin' }
  };
  localStorage.setItem('fireyeProjects-staging', JSON.stringify([
    {
      id: 'p-ours',
      organisationName: 'Alpha Hall',
      siteName: 'Main Gate',
      companyId: 'co-1',
      inspectionNumber: 'FS-100',
      inspectionHistory: [{ inspectionNumber: 'FS-200' }],
      dataManagementAudit: [ours]
    },
    {
      id: 'p-other',
      organisationName: 'Other Hall',
      siteName: 'Yard',
      companyId: 'co-2',
      inspectionHistory: [{ inspectionNumber: 'FS-300' }],
      dataManagementAudit: [other]
    }
  ]));
  localStorage.setItem('fireyeProjects', JSON.stringify([
    { id: 'live-premises', dataManagementAudit: [{ id: 'live-audit', action: 'delete_current_inspection' }] }
  ]));
  localStorage.setItem('fireSDataManagementAuditV12-staging', JSON.stringify([ours, other]));
  localStorage.setItem('fireSDataManagementAuditV12', JSON.stringify([
    { id: 'live-stored', action: 'permanent_delete_entire_premises', companyId: 'co-1' }
  ]));

  const windowObj = {
    FIRE_S_ENV: { isStaging: true },
    setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
    addEventListener() {},
    confirm() { return confirmResult; },
    currentUserProfile: {
      role: 'company_admin',
      companyId: 'co-1',
      fullName: 'Owner'
    }
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
    alert() {},
    confirm() { return confirmResult; },
    getCurrentUserRole() { return 'company_admin'; },
    fireSProjectsStorageKey() { return 'fireyeProjects-staging'; },
    setProjects(projects) {
      localStorage.setItem('fireyeProjects-staging', JSON.stringify(projects));
    },
    getProjects() {
      return JSON.parse(localStorage.getItem('fireyeProjects-staging') || '[]');
    },
    MutationObserver: undefined
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(panel, context);
  const cleared = context.window.fireSClearCompanyDataAuditV16();
  return { cleared, store };
}

const declined = runClear(false);
assert.strictEqual(declined.cleared, false, 'Cancel must leave the Data Audit Log in place');
assert.ok(
  JSON.parse(declined.store['fireSDataManagementAuditV12-staging']).some(entry => entry.id === 'audit-ours'),
  'Cancel must keep this company audit event'
);

const cleared = runClear(true);
assert.strictEqual(cleared.cleared, true, 'Clear must remove the events shown in the Data Audit Log');
const stagingAudit = JSON.parse(cleared.store['fireSDataManagementAuditV12-staging']);
assert.ok(!stagingAudit.some(entry => entry.id === 'audit-ours'), 'This company event must leave the toets audit log');
assert.ok(stagingAudit.some(entry => entry.id === 'audit-other'), 'Another company event must stay in the toets audit log');
const stagingProjects = JSON.parse(cleared.store['fireyeProjects-staging']);
const ours = stagingProjects.find(project => project.id === 'p-ours');
const other = stagingProjects.find(project => project.id === 'p-other');
assert.deepStrictEqual(ours.dataManagementAudit, [], 'This premises audit trail must be cleared');
assert.deepStrictEqual(ours.inspectionHistory, [{ inspectionNumber: 'FS-200' }], 'Clear must not delete inspection history');
assert.strictEqual(other.dataManagementAudit[0].id, 'audit-other', 'Another company premises audit must stay');
assert.strictEqual(
  JSON.parse(cleared.store.fireyeProjects)[0].id,
  'live-premises',
  'Clear on toets must not change live premises'
);
assert.ok(
  JSON.parse(cleared.store.fireSDataManagementAuditV12).some(entry => entry.id === 'live-stored'),
  'Clear on toets must not wipe the live audit log'
);
assert.strictEqual(
  contextEntries(cleared),
  0,
  'This company Data Audit Log must be empty after Clear'
);

function contextEntries(result) {
  return JSON.parse(result.store['fireSDataManagementAuditV12-staging'])
    .filter(entry => entry.companyId === 'co-1').length +
    JSON.parse(result.store['fireyeProjects-staging'])
      .find(project => project.id === 'p-ours').dataManagementAudit.length;
}

console.log('data-audit-log-clear.test.js: ok');
