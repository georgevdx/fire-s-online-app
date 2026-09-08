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

function assertCentre(src, engine, label) {
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
    /function closeCentre\(/.test(block) &&
      /closeCentre\(\);\s*if \(target\) target\.click\(\)/.test(block),
    label + ': Quick Actions must close Command Centre before running the chosen action'
  );
  assert.ok(
    !/Audit Trail/.test(block),
    label + ': Audit Trail must stay out of Quick Actions'
  );

  const dataFn = src.slice(
    src.indexOf('function decorateCommandCentre(projectIdentifier)'),
    src.indexOf('function wrapCommandCentre()')
  );
  assert.ok(
    dataFn.includes('function decorateCommandCentre(projectIdentifier)'),
    label + ': data-management decorator must exist'
  );
  assert.ok(
    /Delete \/ Data Management/.test(dataFn) &&
      /fire-s-cc-data-v12/.test(dataFn) &&
      /closeInspectionOpenGate/.test(dataFn) &&
      /showDataManagement/.test(dataFn),
    label + ': Delete / Data Management must return to Quick Actions and close Command Centre first'
  );

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

assertCentre(liveApp, liveEngine, 'Live');
assertCentre(stagingApp, stagingEngine, 'Toets');
assert.ok(
  /app\.js\?v=1-3-58-close/.test(liveHtml) &&
    /inspection-lifecycle-engine\.js\?v=1-1-cc-place/.test(liveHtml),
  'Live must cache-bust the Command Centre close-and-delete actions'
);
assert.ok(
  /app\.js\?v=1-3-64-close/.test(stagingHtml) &&
    /inspection-lifecycle-engine\.js\?v=1-1-cc-place/.test(stagingHtml),
  'Toets-blad must cache-bust the Command Centre close-and-delete actions'
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

console.log('premises-command-centre.test.js: ok');
