'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const stagingHtml = read('staging/index.html');
const stagingLists = read('staging/fire-s-owner-lists.js');
const stagingApp = read('staging/app.js');

assert.ok(
  /fire-s-owner-lists\.js\?v=1-8-upcoming/.test(stagingHtml) &&
    /function rowsForUniqueBuildings\(/.test(stagingLists) &&
    /Loading upcoming inspections/.test(stagingLists) &&
    /Loading buildings with deficiencies/.test(stagingLists) &&
    /inspectionHistory/.test(stagingLists) &&
    /nextInspectionDate/.test(stagingLists),
  'Toets Home must fill upcoming and deficiencies from every inspection of each company building'
);
assert.ok(
  /function fireSPremisesBuildingKey\(/.test(stagingApp) &&
    /window\.fireSPremisesBuildingKey = fireSPremisesBuildingKey/.test(stagingApp),
  'Upcoming and deficiencies must group inspections by the same premises key as the building count'
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

const helperStart = stagingApp.indexOf('function fireSHasRecycledCurrentInspection');
const helperEnd = stagingApp.indexOf('function fireSIsInspectionOverdue');
assert.ok(helperStart > 0 && helperEnd > helperStart);

const elements = {};
const stored = [
  {
    id: 'school-done',
    organisationName: 'Greenfield School',
    completedAt: '2026-08-01',
    answers: [{ answer: 'No' }, { answer: 'No' }, { answer: 'Yes' }]
  },
  {
    id: 'school-next',
    organisationName: 'Greenfield School',
    lastSaved: '2026-09-20T10:00:00',
    scheduledDate: '2026-09-28',
    answers: []
  },
  {
    id: 'mall',
    organisationName: 'West End Mall',
    siteName: 'Shop 12',
    completedAt: '2026-06-01',
    followUpDate: '2026-09-25',
    inspectionHistory: [
      { answers: [{ answer: 'No' }, { value: 'No' }] }
    ]
  },
  {
    id: 'far',
    organisationName: 'Far Site',
    scheduledDate: '2026-12-01',
    answers: []
  }
];

const sandbox = {
  fireSIsDeletedPremises(project) {
    return !!(project && (project.deletedAt || project.deleteType === 'entire_premises'));
  },
  document: {
    readyState: 'complete',
    getElementById(id) {
      return el(elements, id);
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
  }
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.runInNewContext(
  stagingApp.slice(helperStart, helperEnd) + `
    window.fireSUniqueCurrentBuildings = fireSUniqueCurrentBuildings;
    window.fireSFilterToCloudBuildings = fireSFilterToCloudBuildings;
    window.fireSApplyCloudBuildingFilter = fireSApplyCloudBuildingFilter;
    window.fireSPremisesBuildingKey = fireSPremisesBuildingKey;
    window.fireSIsHiddenFromCurrentLists = fireSIsHiddenFromCurrentLists;
  ` + stagingLists,
  sandbox
);

sandbox.fireSRefreshOwnerLists();
assert.strictEqual(
  el(elements, 'fireSOwnerListsCount').textContent,
  'Loading buildings…'
);
assert.ok(
  /Loading upcoming inspections/.test(el(elements, 'fireSOwnerListsUpcomingBody').innerHTML),
  'Upcoming must not stay blank while the company list is still loading'
);
assert.ok(
  /Loading buildings with deficiencies/.test(el(elements, 'fireSOwnerListsDeficiencyBody').innerHTML),
  'Deficiencies must not stay blank while the company list is still loading'
);

sandbox.__fireSCloudPullSettled = true;
sandbox.fireSApplyCloudBuildingFilter(stored.map(function (row) {
  return { id: row.id, inspection_data: row };
}));
sandbox.fireSRefreshOwnerLists();

assert.strictEqual(
  el(elements, 'fireSOwnerListsCount').textContent,
  '3 buildings on the company inspection list',
  'Greenfield School remains one building even with a later scheduled row'
);

const model = sandbox.fireSBuildOwnerListModel(stored, '2026-09-16');
assert.strictEqual(
  model.upcoming.map(function (row) { return row.due; }).slice().sort().join(','),
  '2026-09-25,2026-09-28',
  'Upcoming must use the scheduled sibling, not drop it when a newer draft has no date'
);
assert.ok(
  model.upcoming.some(function (row) { return row.id === 'school-next' || row.id === 'school-done'; }),
  'Greenfield School must appear on upcoming from the 28 Sep booking'
);
assert.ok(
  model.deficiencies.some(function (row) { return row.name.indexOf('Greenfield School') !== -1 && row.count === 2; }),
  'Deficiencies must keep the completed cycle No answers after a blank scheduled row is more recent'
);
assert.ok(
  model.deficiencies.some(function (row) { return row.id === 'mall' && row.count >= 2; }),
  'History No answers must populate Buildings with deficiencies'
);
assert.ok(
  /Greenfield School/.test(el(elements, 'fireSOwnerListsUpcomingBody').innerHTML) &&
    /West End Mall/.test(el(elements, 'fireSOwnerListsUpcomingBody').innerHTML),
  'Home upcoming table must list the due buildings'
);
assert.ok(
  /Greenfield School/.test(el(elements, 'fireSOwnerListsDeficiencyBody').innerHTML) &&
    /West End Mall/.test(el(elements, 'fireSOwnerListsDeficiencyBody').innerHTML),
  'Home deficiencies table must list buildings with No answers'
);
assert.ok(
  !/Far Site/.test(el(elements, 'fireSOwnerListsUpcomingBody').innerHTML),
  'A date outside 30 days must not appear on upcoming'
);

console.log('home-upcoming-deficiencies.test.js: ok');
