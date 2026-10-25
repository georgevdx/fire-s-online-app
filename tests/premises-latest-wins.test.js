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

assert.ok(
  /Version 1\.3\.130-toets/.test(html),
  'Displayed toets version stays 1.3.130-toets'
);
assert.ok(
  /function fireSSettleDuplicatePremises\(/.test(app) &&
    /fireSSettleDuplicatePremises\(projects\)/.test(app) &&
    /closed_by_later_inspection/.test(app) &&
    /premisesSuperseded === true/.test(app),
  'Saving must close older live inspections of the same premises'
);
assert.ok(
  /A finalised inspection with no open items must not fall through as Not Assessed/.test(app) &&
    /finalised\) return actionCount\(project\) > 0 \? 'ACTION' : 'COMPLIANT'/.test(app),
  'A finished inspection must show Compliant or Action, not Not Assessed'
);

const helperStart = app.indexOf('function fireSHasRecycledCurrentInspection');
const helperEnd = app.indexOf('function fireSPremisesRequiringAction');
assert.ok(helperStart > 0 && helperEnd > helperStart, 'premises settle helpers must load');

const helper = {
  fireSIsDeletedPremises(project) {
    return !!(project && (project.deletedAt || project.deleteType === 'entire_premises'));
  },
  convertProjectToArchivedInspection(project) {
    return {
      archivedAt: '2026-10-22T18:05:00.000Z',
      sourceProjectId: project.id || '',
      inspectionNumber: project.inspectionNumber || '',
      completedAt: project.completedAt || '',
      inspectionDate: project.inspectionDate || '',
      answers: project.answers || [],
      photos: project.photos || [],
      projectName: project.projectName || '',
      organisationName: project.organisationName || '',
      siteName: project.siteName || '',
      projectAddress: project.projectAddress || ''
    };
  }
};
vm.runInNewContext(app.slice(helperStart, helperEnd), helper);

const saved = {
  id: 'just-saved',
  organisationName: '15 on Bond',
  siteName: 'Hatfield',
  projectName: '15 on Bond Hatfield',
  projectAddress: '440 Farenden Street, Arcadia, Pretoria, Gauteng',
  inspectionDate: '2026-10-22',
  lastSaved: '2026-10-22T18:00:00.000Z',
  inspectionStatus: 'finalised',
  inspectionFinalisedAt: '2026-10-22T18:00:00.000Z',
  photos: [{ id: 'p1' }, { id: 'p2' }],
  answers: [{ assessment: 'Compliant' }, { assessment: 'Compliant' }]
};
const older = {
  id: 'already-there',
  organisationName: '15 on Bond Hatfield',
  siteName: '',
  projectName: '15 on Bond Hatfield',
  projectAddress: '440 Farenden Street',
  inspectionDate: '2026-10-22',
  completedAt: '2026-10-22T09:00:00.000Z',
  lastSaved: '2026-10-22T09:00:00.000Z',
  inspectionNumber: 'FS-OLD',
  answers: [{ answer: 'Yes' }],
  photos: []
};

assert.strictEqual(
  helper.fireSPremisesBuildingKey(saved),
  helper.fireSPremisesBuildingKey(older),
  '15 on Bond + Hatfield is the same premises as 15 on Bond Hatfield'
);
assert.notStrictEqual(
  helper.fireSPremisesBuildingKey({ organisationName: 'West End Mall', siteName: 'Shop 12' }),
  helper.fireSPremisesBuildingKey({ organisationName: 'West End Mall', siteName: 'Shop 14' }),
  'Different shops at one mall stay separate premises'
);

const settled = helper.fireSSettleDuplicatePremises([older, saved, {
  id: 'other-shop',
  organisationName: 'West End Mall',
  siteName: 'Shop 12',
  lastSaved: '2026-10-01T00:00:00.000Z'
}]);
assert.strictEqual(settled.changed, true, 'duplicate premises must be closed on save');
const live = settled.projects.filter(project => !helper.fireSIsHiddenFromCurrentLists(project));
assert.deepStrictEqual(
  live.map(project => project.id).sort(),
  ['just-saved', 'other-shop'],
  'Gateway keeps the latest inspection and the unrelated premises'
);
const keeper = settled.projects.find(project => project.id === 'just-saved');
const closed = settled.projects.find(project => project.id === 'already-there');
assert.strictEqual(closed.premisesSuperseded, true);
assert.strictEqual(closed.supersededBy, 'just-saved');
assert.strictEqual(closed.inspectionStatus, 'closed');
assert.ok(
  keeper.inspectionHistory.some(item => item.sourceProjectId === 'already-there' || item.inspectionNumber === 'FS-OLD'),
  'The previous inspection is kept in history'
);

const otherCompany = helper.fireSSettleDuplicatePremises([
  { id: 'co-a', organisationName: '15 on Bond', siteName: 'Hatfield', companyId: 'a', lastSaved: '2026-10-22T18:00:00.000Z', photos: [{ id: 'p' }] },
  { id: 'co-b', organisationName: '15 on Bond', siteName: 'Hatfield', companyId: 'b', lastSaved: '2026-10-22T12:00:00.000Z', completedAt: '2026-10-22T12:00:00.000Z', answers: [{ answer: 'Yes' }] }
]);
assert.strictEqual(otherCompany.changed, false, 'the same name in another company is not a duplicate');
assert.strictEqual(
  Array.from(helper.fireSUniqueCurrentBuildings(otherCompany.projects), project => project.id).sort().join(','),
  'co-a,co-b',
  'Toets keeps one card per company when the premises name matches'
);

const kpiStart = app.indexOf('(function fireS136A10StableVisibleKpis(){');
const kpiEnd = app.indexOf('(function fireS136A11ProjectKpiSingleMatcher(){', kpiStart);
assert.ok(kpiStart > 0 && kpiEnd > kpiStart, '136A10 matcher must exist');
const windowObj = {
  __fireS136A10Installed: false,
  setTimeout() { return 0; },
  setInterval() { return 0; },
  addEventListener() {}
};
const kpi = {
  window: windowObj,
  document: {
    readyState: 'complete',
    body: {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  },
  MutationObserver: class { observe() {} },
  requestAnimationFrame(fn) { fn(); },
  getComputedStyle() { return { display: 'none' }; },
  setTimeout() { return 0; },
  setInterval() { return 0; },
  console,
  Date,
  Math,
  Number,
  String,
  Array,
  Object,
  Boolean,
  JSON,
  getProjectCompletionCounts(project) {
    const answers = Array.isArray(project && project.answers) ? project.answers : [];
    const valueOf = answer => {
      const direct = String((answer && answer.answer) || '').trim().toLowerCase();
      if (direct === 'yes' || direct === 'compliant') return 'yes';
      if (direct === 'no' || direct === 'action required') return 'no';
      if (direct === 'n/a' || direct === 'na') return 'n/a';
      const assessment = String((answer && answer.assessment) || '').trim().toLowerCase();
      if (assessment === 'compliant') return 'yes';
      if (assessment === 'action required') return 'no';
      if (assessment === 'n/a' || assessment === 'na') return 'n/a';
      return '';
    };
    const answered = answers.filter(answer => ['yes', 'no', 'n/a'].includes(valueOf(answer))).length;
    return {
      total: answers.length,
      answered,
      unanswered: Math.max(answers.length - answered, 0),
      noCount: answers.filter(answer => valueOf(answer) === 'no').length
    };
  }
};
kpi.window = Object.assign(windowObj, kpi);
vm.runInNewContext(app.slice(kpiStart, kpiEnd), kpi);
const isCompliant = kpi.window.fireSProductionIsCompliant;
const matches = kpi.window.fireSProductionKpiMatches;

assert.strictEqual(
  isCompliant(saved),
  true,
  'The inspection that was just finalised must count as Compliant when nothing is open'
);
assert.strictEqual(
  matches(saved, 'inspection-attention'),
  false,
  'An all-clear finalised inspection is not Action Required'
);
assert.strictEqual(
  isCompliant({
    id: 'findings',
    inspectionStatus: 'finalised',
    inspectionFinalisedAt: '2026-10-22T18:00:00.000Z',
    answers: [{ answer: 'Yes' }, { assessment: 'Action Required' }]
  }),
  false,
  'A finalised inspection with an open item must not show as Compliant'
);
assert.strictEqual(
  matches({
    id: 'findings',
    inspectionStatus: 'finalised',
    inspectionFinalisedAt: '2026-10-22T18:00:00.000Z',
    answers: [{ answer: 'Yes' }, { assessment: 'Action Required' }]
  }, 'inspection-attention'),
  true,
  'The latest finalised inspection with a No shows Action'
);
assert.strictEqual(
  isCompliant({ id: 'blank', projectName: 'Empty site', answers: [] }),
  false,
  'A premises with no inspection stays Not Assessed'
);

const liveApp = read('app.js');
const liveHtml = read('index.html');
assert.ok(
  /Version 1\.3\.67/.test(liveHtml) &&
    /app\.js\?v=1-3-67-premises/.test(liveHtml) &&
    /fireS\.liveCacheDrop\.1-3-67-premises/.test(liveHtml) &&
    /service-worker\.js\?v=108-81-cancel/.test(liveHtml),
  'Live stays on 1.3.67 and drops the previous phone cache for the premises merge'
);
assert.ok(
  /function fireSSettleDuplicatePremises\(/.test(liveApp) &&
    /function fireSVisiblePremisesRows\(/.test(liveApp) &&
    /fireSSettleDuplicatePremises\(projects\)/.test(liveApp) &&
    /stored !== incoming/.test(liveApp) &&
    /if \(finalised\) return noAnswerCount\(project\) > 0 \? 'ACTION' : 'COMPLIANT'/.test(liveApp),
  'Live save must close older inspections and paint a finished inspection as Compliant or Action'
);

const liveStart = liveApp.indexOf('function fireSPremisesBuildingKey');
const liveEnd = liveApp.indexOf('function fireSIsInspectionOverdue');
assert.ok(liveStart > 0 && liveEnd > liveStart, 'live premises helpers must load');
const liveHelper = {
  window: {},
  setTimeout() { return 0; },
  console,
  Date,
  Map,
  Set,
  convertProjectToArchivedInspection: helper.convertProjectToArchivedInspection
};
vm.runInNewContext(liveApp.slice(liveStart, liveEnd), liveHelper);

assert.strictEqual(
  liveHelper.fireSPremisesBuildingKey(saved),
  liveHelper.fireSPremisesBuildingKey(older),
  'Live treats 15 on Bond + Hatfield as the same premises'
);
const liveSettled = liveHelper.fireSSettleDuplicatePremises([older, saved, {
  id: 'other-shop',
  organisationName: 'West End Mall',
  siteName: 'Shop 12',
  lastSaved: '2026-10-01T00:00:00.000Z'
}]);
assert.strictEqual(liveSettled.changed, true, 'Live must close the older duplicate on save');
const liveVisible = liveHelper.fireSVisiblePremisesRows(liveSettled.projects);
assert.strictEqual(
  Array.from(liveVisible, project => project.id).sort().join(','),
  'just-saved,other-shop',
  'Live Gateway keeps the latest inspection and the unrelated shop'
);
const liveKeeper = liveSettled.projects.find(project => project.id === 'just-saved');
const liveClosed = liveSettled.projects.find(project => project.id === 'already-there');
assert.strictEqual(liveClosed.premisesSuperseded, true);
assert.strictEqual(liveClosed.supersededBy, 'just-saved');
assert.strictEqual(liveClosed.inspectionStatus, 'closed');
assert.ok(
  liveKeeper.inspectionHistory.some(item => item.sourceProjectId === 'already-there' || item.inspectionNumber === 'FS-OLD'),
  'Live keeps the previous inspection in history'
);
const liveAgain = liveHelper.fireSSettleDuplicatePremises(liveSettled.projects);
assert.strictEqual(liveAgain.changed, false, 'A second pass must leave the closed inspection closed');

const liveCompanies = liveHelper.fireSSettleDuplicatePremises([
  { id: 'co-a', organisationName: '15 on Bond', siteName: 'Hatfield', companyId: 'a', lastSaved: '2026-10-22T18:00:00.000Z', photos: [{ id: 'p' }] },
  { id: 'co-b', organisationName: '15 on Bond', siteName: 'Hatfield', companyId: 'b', lastSaved: '2026-10-22T12:00:00.000Z', completedAt: '2026-10-22T12:00:00.000Z', answers: [{ answer: 'Yes' }] }
]);
assert.strictEqual(liveCompanies.changed, false, 'Live must not melt the same name across two companies');
assert.strictEqual(
  Array.from(liveHelper.fireSVisiblePremisesRows(liveCompanies.projects), project => project.id).sort().join(','),
  'co-a,co-b',
  'Live Gateway keeps one card per company when the premises name matches'
);

const liveKpiStart = liveApp.indexOf('(function fireS136A10StableVisibleKpis(){');
const liveKpiEnd = liveApp.indexOf('(function fireS136A11ProjectKpiSingleMatcher(){', liveKpiStart);
assert.ok(liveKpiStart > 0 && liveKpiEnd > liveKpiStart, 'live 136A10 matcher must exist');
const liveWindow = {
  __fireS136A10Installed: false,
  setTimeout() { return 0; },
  setInterval() { return 0; },
  addEventListener() {}
};
const liveKpi = {
  window: liveWindow,
  document: {
    readyState: 'complete',
    body: {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  },
  MutationObserver: class { observe() {} },
  requestAnimationFrame(fn) { fn(); },
  getComputedStyle() { return { display: 'none' }; },
  setTimeout() { return 0; },
  setInterval() { return 0; },
  console,
  Date,
  Math,
  Number,
  String,
  Array,
  Object,
  Boolean,
  JSON
};
liveKpi.window = Object.assign(liveWindow, liveKpi);
vm.runInNewContext(liveApp.slice(liveKpiStart, liveKpiEnd), liveKpi);
assert.strictEqual(
  liveKpi.window.fireSProductionIsCompliant(saved),
  true,
  'Live counts the just-finalised inspection as Compliant when nothing is open'
);
assert.strictEqual(
  liveKpi.window.fireSProductionIsCompliant({
    id: 'findings',
    inspectionStatus: 'finalised',
    inspectionFinalisedAt: '2026-10-22T18:00:00.000Z',
    answers: [{ answer: 'Yes' }, { assessment: 'Action Required' }]
  }),
  false,
  'Live must not call a finalised inspection Compliant when an item is still open'
);

console.log('premises-latest-wins.test.js: ok');
