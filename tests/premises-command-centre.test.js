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

function v1Block(src) {
  const start = src.indexOf('(function fireSSprint21CommandCentreV1(){');
  const end = src.indexOf('(function activateContinueInspectionConfirmationV11(){', start);
  assert.ok(start > 0 && end > start, 'Premises Command Centre V1 must exist');
  return src.slice(start, end);
}

function assertCentre(src, label) {
  const block = v1Block(src);
  const actions = block.indexOf('class="fire-s-cc-actions"');
  const hero = block.indexOf('class="fire-s-cc-hero"');
  const today = block.indexOf('class="fire-s-cc-today"');
  const quick = block.indexOf('class="fire-s-cc-quick"');
  assert.ok(
    actions > 0 && quick > actions && hero > quick && today > hero,
    label + ': Quick Actions must sit above the premises snapshot and status'
  );
  assert.ok(
    /pointer-events:none/.test(block) &&
      /\.fire-s-cc-card/.test(block) &&
      /\.fire-s-cc-hero/.test(block),
    label + ': snapshot, status and info cards must not look clickable'
  );
  assert.ok(
    /\.fire-s-command-more-wrap/.test(block) &&
      /\.fire-s-cc-data-section-v13/.test(block) &&
      /\.fire-s-cc-audit-section-v15/.test(block) &&
      /display:none !important/.test(block),
    label + ': leftover More / Data / Audit cards must be hidden'
  );
  assert.ok(
    /Delete \/ Data Management/.test(src) &&
      /Audit Trail/.test(src) &&
      /fire-s-cc-quick/.test(src),
    label + ': Delete / Data Management and Audit Trail must join Quick Actions'
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

assertCentre(liveApp, 'Live');
assertCentre(stagingApp, 'Toets');
assert.ok(
  /app\.js\?v=1-3-58-cc/.test(liveHtml),
  'Live must cache-bust the Premises Command Centre actions'
);
assert.ok(
  /app\.js\?v=1-3-64-cc/.test(stagingHtml),
  'Toets-blad must cache-bust the Premises Command Centre actions'
);

console.log('premises-command-centre.test.js: ok');
