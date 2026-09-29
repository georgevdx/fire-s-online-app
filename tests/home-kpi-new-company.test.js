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

assert.ok(
  /Version 1\.3\.119-toets/.test(stagingHtml) &&
    /app\.js\?v=1-3-116-homekpi/.test(stagingHtml),
  'Toets must cache-bust empty new-company Home KPI cards as 1.3.119-toets'
);

assert.ok(
  /function fireSHomeCountableProjects\(/.test(stagingApp) &&
    /fireSFilterToCloudBuildings\(list\)/.test(
      stagingApp.slice(
        stagingApp.indexOf('function fireSHomeCountableProjects'),
        stagingApp.indexOf('window.fireSHomeCountableProjects')
      )
    ) &&
    /fireSHomeCountableProjects/.test(
      stagingApp.slice(
        stagingApp.indexOf('(function fireS136A10StableVisibleKpis(){'),
        stagingApp.indexOf('window.fireSProductionKpiCounts')
      )
    ),
  'Home KPI cards must count the same company cloud buildings as All Buildings'
);
assert.ok(
  /const freezeHomeCounts = companyLocals > 0/.test(stagingApp) &&
    /fireSResetHomeForNewCompany\(\)/.test(stagingApp) &&
    /ids: \{\}, keys: \{\}, ready: true/.test(stagingApp),
  'A new trial company must not freeze leftover Home card numbers'
);

const start = stagingApp.indexOf('function fireSPremisesBuildingKey');
const end = stagingApp.indexOf('\nfunction fireSChecklistAnswerValue');
assert.ok(start > 0 && end > start, 'home countable helpers must sit together');

const leftovers = [
  {
    id: 'plastic-view',
    organisationName: 'Plastic View',
    siteName: 'Pretoria',
    companyId: 'old-co',
    createdByUserId: 'user-1'
  },
  {
    id: 'untagged-mine',
    organisationName: 'Old leftover',
    siteName: 'Site',
    createdByUserId: 'user-1'
  }
];

const sandbox = {
  window: {},
  getVisibleProjectsForCurrentUser(list) {
    return list;
  },
  fireSIsHiddenFromCurrentLists() {
    return false;
  }
};
sandbox.window = sandbox;
vm.runInNewContext(stagingApp.slice(start, end), sandbox);

sandbox.__fireSCloudBuildingFilter = { ids: {}, keys: {}, ready: true };
let counted = sandbox.fireSHomeCountableProjects(leftovers);
assert.strictEqual(
  counted.length,
  0,
  'new-company Home cards must be 0 when the company cloud has no buildings'
);

sandbox.__fireSCloudBuildingFilter = {
  ids: { 'plastic-view': true },
  keys: {},
  ready: true
};
counted = sandbox.fireSHomeCountableProjects(leftovers);
assert.strictEqual(counted.length, 1, 'existing-company Home cards must still count that company cloud building');
assert.strictEqual(counted[0].id, 'plastic-view');

const kpiStart = stagingApp.indexOf('(function fireS136A10StableVisibleKpis(){');
const kpiEnd = stagingApp.indexOf('(function fireS136A11ProjectKpiSingleMatcher(){', kpiStart);
assert.ok(kpiStart > 0 && kpiEnd > kpiStart, '136A10 KPI engine must exist');

const kpiSandbox = {
  window: {
    __fireSCloudPullSettled: true,
    __fireSHomeCountsFrozen: false,
    fireSHomeCountableProjects() {
      return [];
    },
    fireSFilterToCloudBuildings() {
      return [];
    },
    getProjects() {
      return leftovers;
    }
  },
  document: {
    body: { classList: { contains() { return false; } } },
    getElementById() { return null; },
    querySelector() { return null; },
    addEventListener() {},
    readyState: 'complete'
  },
  getComputedStyle() {
    return { display: 'block' };
  },
  setTimeout() { return 0; },
  setInterval() { return 0; },
  MutationObserver: function MutationObserver() {
    this.observe = function observe() {};
  },
  requestAnimationFrame(fn) {
    fn();
  }
};
kpiSandbox.window = Object.assign(kpiSandbox.window, kpiSandbox);
kpiSandbox.getProjects = kpiSandbox.window.getProjects;
vm.runInNewContext(stagingApp.slice(kpiStart, kpiEnd), kpiSandbox);
const counts = kpiSandbox.window.fireSProductionKpiCounts();
assert.deepStrictEqual(
  {
    compliant: counts.compliant,
    scheduled: counts.scheduled,
    overdue: counts.overdue,
    month: counts.month
  },
  { compliant: 0, scheduled: 0, overdue: 0, month: 0 },
  'new trial Home KPI row must not show leftover Compliant/Overdue numbers'
);

console.log('home-kpi-new-company.test.js: ok');
