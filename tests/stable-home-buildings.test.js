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
const stagingLists = read('staging/fire-s-owner-lists.js');
const stagingEnv = read('staging/fire-s-env.js');
const stagingSw = read('staging/service-worker.js');

assert.ok(
  /Version 1\.3\.101-toets/.test(stagingHtml) &&
    /app\.js\?v=1-3-101-pay/.test(stagingHtml) &&
    /fire-s-owner-lists\.js\?v=1-5-home-lock/.test(stagingHtml) &&
    /1\.3\.101-toets/.test(stagingEnv) &&
    /fire-s-108-70-toets-101/.test(stagingSw),
  'Toets must show 1.3.101-toets so a phone can tell it has the one company building count'
);
assert.ok(
  /function fireSPremisesBuildingKey\(project\)/.test(stagingApp) &&
    /function fireSUniqueCurrentBuildings\(list\)/.test(stagingApp) &&
    /function fireSFilterToCloudBuildings\(list\)/.test(stagingApp) &&
    /window\.fireSUniqueCurrentBuildings = fireSUniqueCurrentBuildings/.test(stagingApp) &&
    /fireSFilterToCloudBuildings\(visible\)/.test(stagingApp) &&
    /cache: 'no-store'/.test(stagingSw) &&
    /fireS\.toetsCacheDrop\.1-3-101/.test(stagingHtml),
  'Toets must count unique cloud-backed buildings and drop the stuck 1.3.84 phone cache'
);
assert.ok(
  /__fireSCloudPullSettled !== true/.test(stagingLists) &&
    /function uniqueActive\(projects\)/.test(stagingLists) &&
    /fireSFilterToCloudBuildings/.test(stagingLists),
  'Toets Home must show Loading until the company pull settles on the cloud building list'
);
assert.ok(
  /company inspection list/.test(stagingLists) &&
    /Phone and laptop show this same company list/.test(stagingHtml),
  'Home must say this is the company list so phone and laptop are not two different truths'
);

const helperStart = stagingApp.indexOf('function fireSHasRecycledCurrentInspection');
const helperEnd = stagingApp.indexOf('function fireSIsInspectionOverdue');
assert.ok(helperStart > 0 && helperEnd > helperStart, 'unique building helpers must sit with Recycle hide');

const uniqueSandbox = {
  fireSIsDeletedPremises(project) {
    return !!(project && (project.deletedAt || project.deleteType === 'entire_premises'));
  }
};
vm.runInNewContext(
  stagingApp.slice(helperStart, helperEnd) + `
    unique = fireSUniqueCurrentBuildings(rows);
    hidden = fireSIsHiddenFromCurrentLists(rows[rows.length - 1]);
  `,
  Object.assign(uniqueSandbox, {
    rows: [
      { id: 'plastic-a', organisationName: 'Plastic view', completedAt: '2026-07-27' },
      { id: 'plastic-b', organisationName: 'Plastic view', completedAt: '2026-08-01' },
      { id: 'tester-a', organisationName: 'Tester 1', siteName: 'George', completedAt: '2026-06-01' },
      { id: 'tester-b', organisationName: 'Tester 1', siteName: 'George', lastSaved: '2026-09-01' },
      { id: 'cemetery', organisationName: 'Cemetary view', completedAt: '2026-07-17' },
      { id: 'mall', organisationName: 'West End Mall', siteName: 'Shop 12', completedAt: '2026-06-01' },
      { id: 'school', organisationName: 'Greenfield School', completedAt: '2026-08-01' },
      {
        id: 'bin',
        organisationName: 'Saverite Supermarket',
        deletedAt: '2026-09-01',
        deleteType: 'entire_premises',
        completedAt: '2026-08-20'
      }
    ],
    unique: null,
    hidden: null
  })
);
assert.strictEqual(uniqueSandbox.hidden, true, 'Recycle Bin premises stay off the unique list');
assert.strictEqual(
  uniqueSandbox.unique.map(function (row) { return row.id; }).slice().sort().join(','),
  'cemetery,mall,plastic-b,school,tester-b',
  'Eight inspection rows with Recycle and duplicate name+site must count as five buildings'
);

const sevenLocal = [
  { id: 'plastic-b', organisationName: 'Plastic view', completedAt: '2026-08-01' },
  { id: 'tester-b', organisationName: 'Tester 1', siteName: 'George', lastSaved: '2026-09-01' },
  { id: 'cemetery', organisationName: 'Cemetary view', completedAt: '2026-07-17' },
  { id: 'mall', organisationName: 'West End Mall', siteName: 'Shop 12', completedAt: '2026-06-01' },
  { id: 'school', organisationName: 'Greenfield School', completedAt: '2026-08-01' },
  { id: 'hall', organisationName: 'Late Hall', completedAt: '2026-05-01' },
  { id: 'clinic', organisationName: 'River Clinic', completedAt: '2026-04-01' }
];
const fiveCloud = [
  { id: 'plastic-b', inspection_data: { id: 'plastic-b', organisationName: 'Plastic view' } },
  { id: 'tester-b', inspection_data: { id: 'tester-b', organisationName: 'Tester 1', siteName: 'George' } },
  { id: 'cemetery', inspection_data: { id: 'cemetery', organisationName: 'Cemetary view' } },
  { id: 'mall', inspection_data: { id: 'mall', organisationName: 'West End Mall', siteName: 'Shop 12' } },
  { id: 'school', inspection_data: { id: 'school', organisationName: 'Greenfield School' } }
];
const cloudSandbox = {
  fireSIsDeletedPremises(project) {
    return !!(project && (project.deletedAt || project.deleteType === 'entire_premises'));
  },
  window: { __fireSCloudBuildingFilter: null },
  sevenLocal: sevenLocal,
  fiveCloud: fiveCloud,
  backed: null
};
cloudSandbox.window = cloudSandbox;
vm.runInNewContext(
  stagingApp.slice(helperStart, helperEnd) + `
    fireSApplyCloudBuildingFilter(fiveCloud);
    backed = fireSFilterToCloudBuildings(sevenLocal);
  `,
  cloudSandbox
);
assert.strictEqual(
  cloudSandbox.backed.map(function (row) { return row.id; }).slice().sort().join(','),
  'cemetery,mall,plastic-b,school,tester-b',
  'Laptop-only buildings must not make Home 7 while the company cloud still has 5'
);

function el(store, id) {
  if (!store[id]) {
    store[id] = {
      id: id,
      hidden: true,
      style: {
        setProperty(name, value) {
          this[name] = value;
        }
      },
      innerHTML: '',
      textContent: '',
      setAttribute() {},
      removeAttribute() {},
      addEventListener() {},
      classList: { contains() { return false; } }
    };
  }
  return store[id];
}

const localRows = [
  { id: 'plastic-a', organisationName: 'Plastic view', completedAt: '2026-07-27' },
  { id: 'plastic-b', organisationName: 'Plastic view', completedAt: '2026-08-01' },
  { id: 'tester-a', organisationName: 'Tester 1', siteName: 'George', completedAt: '2026-06-01' },
  { id: 'tester-b', organisationName: 'Tester 1', siteName: 'George', lastSaved: '2026-09-01' },
  { id: 'cemetery', organisationName: 'Cemetary view', completedAt: '2026-07-17' },
  { id: 'mall', organisationName: 'West End Mall', siteName: 'Shop 12', completedAt: '2026-06-01' },
  { id: 'school', organisationName: 'Greenfield School', completedAt: '2026-08-01' },
  {
    id: 'bin',
    organisationName: 'Saverite Supermarket',
    deletedAt: '2026-09-01',
    deleteType: 'entire_premises',
    completedAt: '2026-08-20'
  }
];

const listElements = {};
const stored = localRows.slice();
const listSandbox = {
  document: {
    readyState: 'complete',
    getElementById(id) {
      return el(listElements, id);
    },
    addEventListener() {},
    body: {
      classList: {
        contains(name) {
          return name === 'fire-s-role-owner';
        }
      }
    }
  },
  setTimeout() {},
  getProjects() {
    return stored.slice();
  },
  setProjects(list) {
    stored.splice(0, stored.length);
    (list || []).forEach(function (row) {
      stored.push(row);
    });
  },
  fireSIsHiddenFromCurrentLists(project) {
    return !!(project && (project.deletedAt || project.deleteType === 'entire_premises'));
  }
};
listSandbox.window = listSandbox;
listSandbox.global = listSandbox;
vm.runInNewContext(stagingLists, listSandbox);

const model = listSandbox.fireSBuildOwnerListModel(stored, '2026-09-16');
assert.strictEqual(
  model.count,
  5,
  'Owner lists must count unique buildings, not eight laptop inspection rows'
);
assert.ok(
  !model.all.some(function (row) { return row.id === 'bin'; }),
  'Recycle Bin premises must not appear on the Home building list'
);

listSandbox.fireSRefreshOwnerLists();
assert.strictEqual(
  el(listElements, 'fireSOwnerListsCount').textContent,
  'Loading buildings…',
  'Laptop must not paint a finished 8 before the company pull settles'
);

listSandbox.__fireSCloudPullSettled = true;
listSandbox.fireSRefreshOwnerLists();
assert.strictEqual(
  el(listElements, 'fireSOwnerListsCount').textContent,
  '5 buildings on the company inspection list',
  'Settled Home must show the unique company building count shared with the phone'
);

stored.splice(stored.length - 1, 1);
listSandbox.fireSRefreshOwnerLists();
assert.strictEqual(
  el(listElements, 'fireSOwnerListsCount').textContent,
  '5 buildings on the company inspection list',
  'Delayed Home refresh must not wriggle 8 then 7 after the unique count is locked'
);

listSandbox.setProjects([
  { id: 'cemetery', organisationName: 'Cemetary view', completedAt: '2026-07-17' },
  { id: 'mall', organisationName: 'West End Mall', completedAt: '2026-06-01' },
  { id: 'school', organisationName: 'Greenfield School', completedAt: '2026-08-01' }
]);
assert.strictEqual(
  el(listElements, 'fireSOwnerListsCount').textContent,
  '3 buildings on the company inspection list',
  'A later setProjects after settle may update the unique building count'
);

console.log('stable-home-buildings.test.js: ok');
