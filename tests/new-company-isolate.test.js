'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const stagingApp = read('staging/app.js');
const stagingHtml = read('staging/index.html');
const stagingStarted = read('staging/fire-s-get-started.js');
const stagingTeam = read('staging/fire-s-company-team.js');

assert.ok(
  /Version 1\.3\.114-toets/.test(stagingHtml) &&
    /app\.js\?v=1-3-114-isolate/.test(stagingHtml) &&
    /fire-s-get-started.js\?v=2-59-isolate/.test(stagingHtml) &&
    /fireS\.toetsCacheDrop\.1-3-119/.test(stagingHtml),
  'Toets must cache-bust the clean new-company lists'
);

assert.ok(
  /function fireSMarkCompanyIsolated\(/.test(stagingApp) &&
    /function fireSCompanyAdoptsLocalLeftovers\(/.test(stagingApp) &&
    /fireS\.isolateCompanyInspections\.v1/.test(stagingApp),
  'Toets must remember which companies start empty'
);
assert.ok(
  /if \(!adoptLeftovers\) return project/.test(stagingApp) &&
    /if \(cid && !projectCid && !adoptLeftovers\) return/.test(stagingApp) &&
    /if \(companyId && userId && adoptLeftovers\)/.test(stagingApp),
  'A clean company must not restamp, upload or pull leftover inspections'
);
assert.ok(
  /if \(projectCompanyId\) return false/.test(stagingApp) &&
    /return owned;/.test(
      stagingApp.slice(
        stagingApp.indexOf('function fireSFilterProjectsForProfile'),
        stagingApp.indexOf('function getVisibleProjectsForCurrentUser')
      )
    ) &&
    !/return owned\.length \? owned : activeProjects/.test(
      stagingApp.slice(
        stagingApp.indexOf('function fireSFilterProjectsForProfile'),
        stagingApp.indexOf('function getVisibleProjectsForCurrentUser')
      )
    ),
  'Home and Inspection Gateway must not fall back to another company list'
);
assert.ok(
  /fire_s_start_fresh_company/.test(stagingStarted) &&
    /Starting a clean company/.test(stagingStarted) &&
    /markCreatedCompanyIsolated/.test(stagingStarted) &&
    /companyNamesMatch/.test(stagingStarted),
  'Access Subscribe must start a clean company when the typed name is new'
);
assert.ok(
  /fireSMarkCompanyIsolated/.test(stagingTeam),
  'Personnel start-fresh must keep the new company empty'
);

const store = {};
const sandbox = {
  window: {},
  localStorage: {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    }
  },
  currentUserProfile: {
    id: 'user-1',
    email: 'owner@example.com',
    companyId: 'tester-app'
  },
  fireSIsDeletedPremises() {
    return false;
  },
  fireSIsEmptyRecycleLeftoverPremises() {
    return false;
  },
  fireSIsHiddenFromCurrentLists() {
    return false;
  },
  getProjects() {
    return sandbox._projects.slice();
  },
  setProjects(next) {
    sandbox._projects = next.slice();
  },
  queueInspectionForUpload(id) {
    sandbox._queued.push(String(id));
  },
  uploadPendingInspections() {}
};
sandbox.window = sandbox;
sandbox._projects = [];
sandbox._queued = [];

const helperStart = stagingApp.indexOf('var FIRE_S_ISOLATE_COMPANY_KEY');
const helperEnd = stagingApp.indexOf('\nfunction getVisibleProjectsForCurrentUser');
assert.ok(helperStart > 0 && helperEnd > helperStart, 'isolate helpers must sit with the company filter');
vm.runInNewContext(stagingApp.slice(helperStart, helperEnd), sandbox);

sandbox.fireSMarkCompanyIsolated('tester-app');
assert.strictEqual(
  sandbox.fireSCompanyAdoptsLocalLeftovers('tester-app'),
  false,
  'a newly created company must not adopt leftovers'
);
assert.strictEqual(
  sandbox.fireSCompanyAdoptsLocalLeftovers('old-co'),
  true,
  'an existing company may still keep its own untagged leftovers'
);

const leftovers = [
  {
    id: 'plastic-view',
    organisationName: 'Plastic View',
    companyId: 'old-co',
    createdByUserId: 'user-1',
    createdByEmail: 'owner@example.com'
  },
  {
    id: 'untagged-mine',
    organisationName: 'Old leftover',
    createdByUserId: 'user-1',
    createdByEmail: 'owner@example.com'
  },
  {
    id: 'legacy',
    organisationName: 'No owner building'
  },
  {
    id: 'tester-row',
    organisationName: 'New site',
    companyId: 'tester-app',
    createdByUserId: 'user-1'
  }
];

let visible = sandbox.fireSFilterProjectsForProfile(
  leftovers,
  sandbox.currentUserProfile,
  false
);
assert.deepStrictEqual(
  visible.map(function (row) {
    return row.id;
  }),
  ['tester-row'],
  'tester app Home/Gateway must only show its own inspections'
);

visible = sandbox.fireSFilterProjectsForProfile(
  leftovers.filter(function (row) {
    return row.id !== 'tester-row';
  }),
  sandbox.currentUserProfile,
  false
);
assert.deepStrictEqual(
  visible.map(function (row) {
    return row.id;
  }),
  [],
  'a brand-new company with no inspections must stay empty'
);

sandbox._projects = leftovers.map(function (row) {
  return Object.assign({}, row);
});
sandbox._queued = [];
sandbox.restampLocalInspectionsWithCompany('tester-app', 'tester app');
assert.strictEqual(
  sandbox._projects.find(function (row) {
    return row.id === 'untagged-mine';
  }).companyId,
  undefined,
  'untagged leftovers must stay off the new company'
);
assert.strictEqual(
  sandbox._projects.find(function (row) {
    return row.id === 'plastic-view';
  }).companyId,
  'old-co',
  'must not move Plastic View onto tester app'
);
assert.ok(
  sandbox._queued.indexOf('untagged-mine') === -1 &&
    sandbox._queued.indexOf('plastic-view') === -1,
  'must not upload leftover buildings into tester app'
);

sandbox._projects = leftovers.map(function (row) {
  return Object.assign({}, row);
});
sandbox._queued = [];
const queued = sandbox.queueLocalPremisesMissingFromCloud(sandbox._projects, []);
assert.strictEqual(queued, 1, 'only tester-app rows may upload after a new subscribe');
assert.ok(
  sandbox._queued.indexOf('tester-row') !== -1 &&
    sandbox._queued.indexOf('plastic-view') === -1 &&
    sandbox._queued.indexOf('untagged-mine') === -1,
  'must not upload Plastic View into the new company'
);

console.log('new-company-isolate.test.js: ok');
