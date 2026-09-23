'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const stagingHtml = read('staging/index.html');
const stagingApp = read('staging/app.js');
const stagingLists = read('staging/fire-s-owner-lists.js');
const stagingEntitlement = read('staging/fire-s-entitlement.js');

assert.ok(
  /app\.js\?v=1-3-113-temp-pw/.test(stagingHtml) &&
    /fire-s-owner-lists\.js\?v=1-10-last-def/.test(stagingHtml) &&
    /fire-s-entitlement\.js\?v=1-3-111-noshock/.test(stagingHtml) &&
    /fireS\.toetsCacheDrop\.1-3-114/.test(stagingHtml) &&
    /Version 1\.3\.113-toets/.test(stagingHtml),
  'Toets must cache-bust last-inspection Home counts without bumping the displayed version'
);
assert.ok(
  /if \(!hasSnapshot\(\)\) return false/.test(stagingEntitlement) &&
    /if \(!hasSnapshot\(\)\) return true/.test(stagingEntitlement),
  'Home must stay visible while entitlement loads instead of flashing the red lock'
);
assert.ok(
  !/stat\('Photos', data\.photos/.test(stagingApp) &&
    /action premises/.test(stagingApp) &&
    /function fireSPremisesRequiringAction\(/.test(stagingApp) &&
    /function fireSLastInspectionActionCountForBuilding\(/.test(stagingApp),
  'Executive Snapshot must drop Photos and count unique last-inspection action premises'
);
assert.ok(
  /fireSSetOwnerListsPullProgress\(visibleCount, visibleCount, false\)/.test(stagingApp) &&
    /!companyCloudListReady\(\)/.test(stagingLists),
  'Home building count must stay on Loading until the company list is ready'
);

const helperStart = stagingApp.indexOf('function fireSHasRecycledCurrentInspection');
const helperEnd = stagingApp.indexOf('function fireSIsInspectionOverdue');
assert.ok(helperStart > 0 && helperEnd > helperStart);

const rows = [
  {
    id: 'hall-old',
    organisationName: 'Civic Hall',
    completedAt: '2026-05-01',
    answers: [{ answer: 'No' }]
  },
  {
    id: 'hall-last',
    organisationName: 'Civic Hall',
    completedAt: '2026-08-01',
    answers: [{ answer: 'No' }, { answer: 'No' }]
  },
  {
    id: 'clinic',
    organisationName: 'River Clinic',
    completedAt: '2026-07-02',
    answers: [{ answer: 'No' }, { answer: 'No' }]
  },
  {
    id: 'yard',
    organisationName: 'Depot Yard',
    completedAt: '2026-07-03',
    answers: [{ answer: 'No' }, { answer: 'No' }]
  },
  {
    id: 'clean-old',
    organisationName: 'Clear School',
    completedAt: '2026-06-01',
    answers: [{ answer: 'No' }, { answer: 'No' }]
  },
  {
    id: 'clean-last',
    organisationName: 'Clear School',
    completedAt: '2026-09-01',
    answers: [{ answer: 'Yes' }, { answer: 'Yes' }]
  }
];

const sandbox = {
  fireSIsDeletedPremises() { return false; },
  window: {},
  rows: rows,
  actionPremises: null
};
sandbox.window = sandbox;
vm.runInNewContext(
  stagingApp.slice(helperStart, helperEnd) + `
    actionPremises = fireSPremisesRequiringAction(rows);
  `,
  sandbox
);

assert.strictEqual(
  sandbox.actionPremises.map(function (row) { return row.organisationName; }).slice().sort().join(','),
  'Civic Hall,Depot Yard,River Clinic',
  'Open Actions must count 3 action premises, not 6 No answers, and drop a building whose last inspection is clear'
);
assert.strictEqual(
  sandbox.fireSLastInspectionActionCountForBuilding(rows, rows[0]),
  2,
  'Civic Hall must use the later inspection of 2 Nos, not the older 1'
);

console.log('home-last-deficiencies.test.js: ok');
