'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveEngine = read('inspection-lifecycle-engine.js');
const stagingEngine = read('staging/inspection-lifecycle-engine.js');

function v1Block(src) {
  const start = src.indexOf('(function fireSSprint21CommandCentreV1(){');
  const end = src.indexOf('(function activateContinueInspectionConfirmationV11(){', start);
  assert.ok(start > 0 && end > start, 'Premises Command Centre V1 must exist');
  return src.slice(start, end);
}

function gateFn(src) {
  const start = src.indexOf('function shouldShowInspectionOpenGate');
  const end = src.indexOf('function ensureInspectionOpenGateStyles');
  assert.ok(start > 0 && end > start, 'shouldShowInspectionOpenGate must exist');
  return src.slice(start, end);
}

function assertCentre(src, engine, label, options) {
  const block = v1Block(src);
  const actions = block.indexOf('class="fire-s-cc-actions"');
  const quick = block.indexOf('class="fire-s-cc-quick"');
  assert.ok(actions > 0 && quick > actions, label + ': Quick Actions must remain in Command Centre');
  assert.ok(
    /getProjectPremisesName/.test(block) && /getProjectPremisesAddress/.test(block),
    label + ': Command Centre header must use the premises name and address'
  );
  assert.ok(
    !/class="fire-s-cc-today"/.test(block) &&
      !/class="fire-s-cc-grid"/.test(block) &&
      !/class="fire-s-cc-hero"/.test(block) &&
      !/class="fire-s-cc-card"/.test(block),
    label + ': Status card and 2x2 info cards must be removed'
  );
  assert.ok(
    /\.fire-s-command-more-wrap/.test(block) &&
      /\.fire-s-cc-data-section-v13/.test(block) &&
      /\.fire-s-cc-audit-section-v15/.test(block) &&
      /display:none !important/.test(block),
    label + ': leftover More / Data / Audit cards must stay hidden'
  );
  assert.ok(
    !/Audit Trail/.test(block),
    label + ': Audit Trail must stay out of Quick Actions'
  );
  assert.ok(
    /openLatestPremisesReport\(project\)/.test(block),
    label + ': Latest Report must open the premises report, not only close Command Centre'
  );
  assert.ok(
    /function openLatestPremisesReport\(/.test(src) &&
      /bypassOpenGate: true/.test(src.slice(src.indexOf('function openLatestPremisesReport('), src.indexOf('function generateArchivedInspectionReport('))) &&
      /revealInspectionReportSection\(\)/.test(src),
    label + ': Latest Report must show the inspection form so reportSection is visible'
  );
  assert.ok(
    /openLatestPremisesReport\(project\)/.test(
      src.slice(src.indexOf('data-command="latest-report"'), src.indexOf('function fireSSprint21MorePanelGate'))
    ),
    label + ': More-panel Latest Report must use the same premises report opener'
  );

  const dataFn = src.slice(
    src.indexOf('function decorateCommandCentre(projectIdentifier)'),
    src.indexOf('function wrapCommandCentre()')
  );
  assert.ok(
    dataFn.includes('function decorateCommandCentre(projectIdentifier)'),
    label + ': data-management decorator must exist'
  );

  if (options && options.closeAndDelete) {
    assert.ok(
      /function closeCentre\(/.test(block) &&
        /closeCentre\(\);\s*if \(target\) target\.click\(\)/.test(block),
      label + ': Quick Actions must close Command Centre before running the chosen action'
    );
    assert.ok(
      /Delete \/ Data Management/.test(dataFn) &&
        /fire-s-cc-data-v12/.test(dataFn) &&
        /closeInspectionOpenGate/.test(dataFn) &&
        /showDataManagement/.test(dataFn),
      label + ': Delete / Data Management must return to Quick Actions and close Command Centre first'
    );
  } else {
    assert.ok(
      !/function closeCentre\(/.test(block),
      label + ': live must stay on the previous Command Centre until it is sat live'
    );
  }

  const auditFn = src.slice(
    src.indexOf('function decorateCommandCentre(){'),
    src.indexOf('function scheduleDecorate()')
  );
  assert.ok(
    auditFn.includes('function decorateCommandCentre(){'),
    label + ': audit decorator must exist'
  );
  assert.ok(
    !/Audit Trail/.test(auditFn) && !/fire-s-cc-audit-v15/.test(auditFn),
    label + ': audit decorator must not inject a Quick Action'
  );

  const gate = gateFn(src);
  assert.ok(/project\.id/.test(gate), label + ': existing premises (saved id) must enter Command Centre');
  assert.ok(
    !/hasCurrentIncompleteInspection/.test(gate) && !/scheduleFreshInspection/.test(gate),
    label + ': incomplete or scheduled premises must not skip Command Centre'
  );
  assert.ok(/return true/.test(gate), label + ': Command Centre is the default open path for a saved premises');
  assert.ok(
    !/if \(!project\?\.completedAt && !completion\.complete\)/.test(engine),
    label + ': lifecycle engine must not skip Command Centre for incomplete inspections'
  );

  assert.ok(
    !/Documents and Analytics remain outside this foundation patch/.test(src),
    label + ': must not mention unfinished Documents or Analytics'
  );
  assert.ok(
    !/not available yet/.test(src) &&
      !/not available in this build/.test(src) &&
      !/will show here once archived inspections are available/.test(src),
    label + ': must not tell clients the app is incomplete'
  );
  const create = src.slice(
    src.indexOf('function createNewProject()'),
    src.indexOf('function toggleFilterPanel()')
  );
  assert.ok(create.includes('function createNewProject()'), label + ': createNewProject must exist');
  assert.ok(
    !/showInspectionOpenGate/.test(create) &&
      /showProjectForm\(\)/.test(create),
    label + ': a new premises inspection must stay on the blank form'
  );
}

assertCentre(liveApp, liveEngine, 'Live', { closeAndDelete: true });
assertCentre(stagingApp, stagingEngine, 'Toets', { closeAndDelete: true });
assert.ok(
  /app\.js\?v=1-3-58-clear/.test(liveHtml),
  'Live must cache-bust Command Centre Latest Report'
);
assert.ok(
  /app\.js\?v=1-3-64-sub/.test(stagingHtml) &&
    /inspection-lifecycle-engine\.js\?v=1-1-cc-place/.test(stagingHtml),
  'Toets-blad must keep the Command Centre close-and-delete actions'
);

function loadRuntime(src) {
  const helpers = src.slice(
    src.indexOf('function combineStreetAddress'),
    src.indexOf('async function loadJson')
  );
  const identity = src.slice(
    src.indexOf('function getProjectPremisesName'),
    src.indexOf('function isProjectInPremisesCompanyScope')
  );
  return new Function(
    helpers + '\n' + identity + '\n' + gateFn(src) +
    '\nreturn { shouldShowInspectionOpenGate, getProjectPremisesName, getProjectPremisesAddress };'
  )();
}

function assertRuntime(src, label) {
  const fns = loadRuntime(src);
  assert.strictEqual(
    fns.shouldShowInspectionOpenGate({ id: 'prem-1' }),
    true,
    label + ': a saved premises must open Command Centre'
  );
  assert.strictEqual(
    fns.shouldShowInspectionOpenGate({ id: 'prem-1', scheduleFreshInspection: true }),
    true,
    label + ': a scheduled existing premises must still open Command Centre'
  );
  assert.strictEqual(
    fns.shouldShowInspectionOpenGate({ id: 'prem-1' }, 'findings'),
    false,
    label + ': Findings / Dashboard jumps may skip Command Centre'
  );
  assert.strictEqual(
    fns.shouldShowInspectionOpenGate({ projectName: 'New site' }),
    false,
    label + ': a new unsaved premises must not open Command Centre'
  );
  assert.strictEqual(
    fns.getProjectPremisesName({ organisationName: 'Acme Foods', siteName: 'George plant' }),
    'Acme Foods',
    label + ': header name must prefer the organisation / premises name'
  );
  assert.strictEqual(
    fns.getProjectPremisesAddress({
      streetNumber: '12',
      addressLine: 'York Street, George'
    }),
    '12 York Street, George',
    label + ': header address must combine street number and street'
  );
}

assertRuntime(liveApp, 'Live runtime');
assertRuntime(stagingApp, 'Toets runtime');

function assertActionClosesFirst(label) {
  let closed = false;
  let actionSawClosed = false;
  const closeInspectionOpenGate = () => {
    closed = true;
  };
  const closeCentre = new Function(
    'closeInspectionOpenGate',
    'return function closeCentre(){ if (typeof closeInspectionOpenGate === "function") closeInspectionOpenGate(); }'
  )(closeInspectionOpenGate);
  const target = {
    click() {
      actionSawClosed = closed;
    }
  };
  closeCentre();
  if (target) target.click();
  assert.strictEqual(closed, true, label + ': Command Centre close must run');
  assert.strictEqual(
    actionSawClosed,
    true,
    label + ': the chosen action must run only after Command Centre has closed'
  );
}

assertActionClosesFirst('Close-then-act');

function assertRevealReportFromGateway(src, label) {
  const start = src.indexOf('function revealInspectionReportSection()');
  const end = src.indexOf('function latestInspectionHistoryIndex(project)', start);
  assert.ok(start > 0 && end > start, label + ': revealInspectionReportSection must exist');
  const homeSection = { style: { display: 'block' } };
  const projectListSection = { style: { display: 'block' } };
  const projectFormSection = { style: { display: 'none' } };
  const reportSection = { style: { display: 'none' } };
  const reveal = new Function(
    'document',
    src.slice(start, end) + '\nreturn revealInspectionReportSection;'
  )({
    getElementById(id) {
      if (id === 'homeSection') return homeSection;
      if (id === 'projectListSection') return projectListSection;
      if (id === 'projectFormSection') return projectFormSection;
      if (id === 'reportSection') return reportSection;
      return null;
    }
  });
  reveal();
  assert.strictEqual(homeSection.style.display, 'none', label + ': Home must hide when Latest Report opens');
  assert.strictEqual(
    projectListSection.style.display,
    'none',
    label + ': Inspection Gateway must hide when Latest Report opens'
  );
  assert.strictEqual(projectFormSection.style.display, 'block', label + ': inspection form must become visible');
  assert.strictEqual(reportSection.style.display, 'block', label + ': report section must become visible');
}

function assertLatestHistoryIndex(src, label) {
  const start = src.indexOf('function latestInspectionHistoryIndex(project)');
  const end = src.indexOf('function openLatestPremisesReport(project, focusMode)', start);
  assert.ok(start > 0 && end > start, label + ': latestInspectionHistoryIndex must exist');
  const latestIndex = new Function(
    'getInspectionHistoryTimestamp',
    src.slice(start, end) + '\nreturn latestInspectionHistoryIndex;'
  )(function (inspection) {
    return Number(inspection && inspection.ts) || 0;
  });
  assert.strictEqual(
    latestIndex({ inspectionHistory: [{ ts: 10 }, { ts: 40 }, { ts: 20 }] }),
    1,
    label + ': Latest Report must use the newest archived inspection, not the last array slot'
  );
}

function assertLatestReportOpensPremises(src, label) {
  const start = src.indexOf('function openLatestPremisesReport(project, focusMode)');
  const end = src.indexOf('function generateArchivedInspectionReport(projectId, historyIndex)', start);
  assert.ok(start > 0 && end > start, label + ': openLatestPremisesReport must exist');
  const calls = [];
  const openLatest = new Function(
    'closeInspectionOpenGate',
    'openProject',
    'generateArchivedInspectionReport',
    'revealInspectionReportSection',
    'latestInspectionHistoryIndex',
    'window',
    src.slice(start, end) + '\nreturn openLatestPremisesReport;'
  )(
    function () { calls.push('close'); },
    function (id, focus, options) {
      calls.push(['open', id, options && options.bypassOpenGate]);
    },
    function (id, index) { calls.push(['report', id, index]); },
    function () { calls.push('reveal'); },
    function () { return 1; },
    { setTimeout(fn) { fn(); } }
  );
  openLatest({ id: 'prem-9', inspectionHistory: [{}, {}] });
  assert.deepStrictEqual(
    calls,
    ['close', ['open', 'prem-9', true], 'reveal', ['report', 'prem-9', 1]],
    label + ': Latest Report must close Command Centre, open the premises, then show the report'
  );
}

assertRevealReportFromGateway(liveApp, 'Live reveal');
assertRevealReportFromGateway(stagingApp, 'Toets reveal');
assertLatestHistoryIndex(liveApp, 'Live latest index');
assertLatestHistoryIndex(stagingApp, 'Toets latest index');
assertLatestReportOpensPremises(liveApp, 'Live opener');
assertLatestReportOpensPremises(stagingApp, 'Toets opener');

console.log('premises-command-centre.test.js: ok');
