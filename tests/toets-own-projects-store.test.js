'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const stagingApp = read('staging/app.js');
const liveApp = read('app.js');
const stagingGuard = read('staging/fire-s-premises-integrity-guard.js');

assert.ok(
  /function fireSProjectsStorageKey\(/.test(stagingApp) &&
    /fireyeProjects-staging/.test(stagingApp) &&
    /localStorage\.getItem\(fireSProjectsStorageKey\(\)\)/.test(stagingApp) &&
    /localStorage\.setItem\(storageKey, JSON\.stringify\(projects\)\)/.test(stagingApp),
  'Toets must store inspections in fireyeProjects-staging, not the live fireyeProjects key'
);

assert.ok(
  /function getProjects\(\) \{\n  const saved = localStorage\.getItem\('fireyeProjects'\);/.test(liveApp),
  'Live must keep using fireyeProjects'
);
assert.ok(
  !/fireyeProjects-staging/.test(liveApp),
  'Live must not switch to the toets storage key'
);

assert.ok(
  /fireyeProjects-staging/.test(stagingGuard),
  'Toets integrity guard must not read live fireyeProjects as a fallback'
);

const snapStart = stagingApp.indexOf('function readVisibleProjects()');
const snapEnd = stagingApp.indexOf('function isClosed(project)', snapStart);
assert.ok(snapStart > 0 && snapEnd > snapStart, 'Executive snapshot reader must exist');
const snap = stagingApp.slice(snapStart, snapEnd);
assert.ok(
  /projectMatchesInspectionDateFilter/.test(snap),
  'Snapshot Premises count must follow the same date filter as the ALL chip'
);
assert.ok(
  /in date filter/.test(stagingApp),
  'Snapshot must say in date filter when Today/From-To is active'
);

const liveSnapStart = liveApp.indexOf('function readVisibleProjects()');
const liveSnapEnd = liveApp.indexOf('function isClosed(project)', liveSnapStart);
assert.ok(liveSnapStart > 0 && liveSnapEnd > liveSnapStart, 'Live executive snapshot reader must exist');
assert.ok(
  /projectMatchesInspectionDateFilter/.test(liveApp.slice(liveSnapStart, liveSnapEnd)) &&
    /in date filter/.test(liveApp),
  'Live snapshot Premises count must follow the same inspection-date filter as the ALL chip'
);

console.log('toets-own-projects-store.test.js: ok');
