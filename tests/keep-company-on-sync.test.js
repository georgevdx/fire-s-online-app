'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function loadHelpers(source) {
  const start = source.indexOf('function fireSCachedCompanyStorageKey()');
  const end = source.indexOf('async function loadUserAccessProfile()');
  assert.ok(start > 0 && end > start);
  const store = {};
  const sandbox = {
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem(key, value) {
        store[key] = String(value);
      }
    },
    fireSIsGenericCompanyName(name) {
      const n = String(name || '').trim().toLowerCase();
      return (
        !n ||
        n === 'your company' ||
        n === 'your new company' ||
        n === 'local workspace' ||
        n === 'local / personal workspace'
      );
    },
    fireSIsDeletedPremises(project) {
      return !!(project && project.deletedAt);
    },
    fireSProjectsStorageKey() {
      return 'fireyeProjects';
    },
    getProjects() {
      return sandbox.projects || [];
    },
    projects: []
  };
  vm.runInNewContext(source.slice(start, end), sandbox);
  sandbox.store = store;
  return sandbox;
}

['app.js', 'staging/app.js'].forEach(file => {
  const source = read(file);
  assert.ok(
    /fireSKeptCompany\(/.test(source) &&
      /const companyId = keptCompany\.companyId \|\| null;/.test(source),
    file + ' must keep the known company when a sync finds no membership row'
  );

  const box = loadHelpers(source);

  const live = box.fireSKeptCompany('co-live', '', '', 'owner@example.com');
  assert.strictEqual(live.companyId, 'co-live', file);

  box.projects = [
    {
      id: 'alpha',
      companyId: 'co-super',
      companyName: 'Company test Super',
      createdByEmail: 'owner@example.com'
    },
    {
      id: 'gone',
      companyId: 'co-other',
      companyName: 'Other Co',
      createdByEmail: 'someone@example.com',
      deletedAt: '2026-11-11T00:00:00.000Z'
    }
  ];
  const fromBuilding = box.fireSKeptCompany('', '', '', 'owner@example.com');
  assert.strictEqual(fromBuilding.companyId, 'co-super', file);
  assert.strictEqual(fromBuilding.companyName, 'Company test Super', file);

  box.projects = [];
  box.store['fireS.cachedCompany'] = JSON.stringify({
    id: 'co-cache',
    name: 'Company test Super'
  });
  const fromCache = box.fireSKeptCompany('', '', '', 'owner@example.com');
  assert.strictEqual(fromCache.companyId, 'co-cache', file);
  assert.strictEqual(fromCache.companyName, 'Company test Super', file);

  delete box.store['fireS.cachedCompany'];
  const fresh = box.fireSKeptCompany('', '', '', 'owner@example.com');
  assert.strictEqual(fresh.companyId, '', file);

  box.projects = [
    {
      id: 'other',
      companyId: 'co-other',
      companyName: 'Other Co',
      createdByEmail: 'someone@example.com'
    }
  ];
  const notMine = box.fireSKeptCompany('', '', '', 'owner@example.com');
  assert.strictEqual(notMine.companyId, '', file);
});

['app.js', 'staging/app.js'].forEach(file => {
  const source = read(file);
  const start = source.indexOf('function fireSCloudInventoryStorageKey()');
  const end = source.indexOf('function forgetPremisesRemovedFromCloud');
  assert.ok(start > 0 && end > start, file);
  const store = {};
  const removed = [];
  const sandbox = {
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem(key, value) {
        store[key] = String(value);
      }
    },
    fireSProjectsStorageKey() {
      return 'fireyeProjects';
    },
    fireSCloudRowInspectionId(row) {
      return String((row && (row.id || (row.inspection_data && row.inspection_data.id))) || '').trim();
    },
    markProjectDeleted(id) {
      removed.push(String(id));
    },
    removeInspectionFromUploadQueue() {}
  };
  vm.runInNewContext(source.slice(start, end), sandbox);
  const projects = [
    { id: 'alpha', companyId: 'co-super', companyName: 'Company test Super' },
    { id: 'extra-1', syncPending: true },
    { id: 'extra-2' }
  ];
  assert.strictEqual(
    sandbox.fireSLimitToCloudInventory(projects).length,
    3,
    file + ' shows every local premises until a company list exists'
  );
  sandbox.fireSRememberCloudInventory([{ id: 'alpha' }]);
  const shown = sandbox.fireSLimitToCloudInventory(projects).map(project => project.id).join('|');
  assert.strictEqual(shown, 'alpha', file + ' home count must open the company list');
  const kept = sandbox.fireSDropPremisesOutsideCompanyList(projects, ['alpha']);
  assert.strictEqual(kept.map(project => project.id).join('|'), 'alpha', file);
  assert.ok(removed.indexOf('extra-1') !== -1 && removed.indexOf('extra-2') !== -1, file);
});

console.log('keep-company-on-sync.test.js: ok');
