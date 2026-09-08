'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const liveLists = read('fire-s-owner-lists.js');
const stagingLists = read('staging/fire-s-owner-lists.js');
const liveFlow = read('fire-s-global-flow.js');
const stagingFlow = read('staging/fire-s-global-flow.js');
const agents = read('AGENTS.md');

function assertShared(src, label) {
  assert.ok(/function openLatestPremisesReport\(/.test(src), label + ': Latest Report must open the premises report');
  assert.ok(/function revealInspectionReportSection\(/.test(src), label + ': reportSection must unhide with the inspection form');
  assert.ok(/fireSCloudPullGeneration/.test(src), label + ': Home count must ignore overlapping cloud pulls');
  assert.ok(
    /closeCentre\(\);\s*if \(target\) target\.click\(\)/.test(src),
    label + ': Command Centre Quick Actions must close, then run the chosen action'
  );
  assert.ok(
    /Open, continue, search and manage inspections\./.test(src),
    label + ': Inspection Gateway copy must stay Open, continue…'
  );
  assert.ok(
    !/Inspection Gateway', 'Search, open/.test(src) &&
      !/Inspection Gateway','Search, open/.test(src),
    label + ': Inspection Gateway must not flicker to Search, open…'
  );
  assert.ok(
    /An unfinished current inspection already exists/.test(src),
    label + ': Start Inspection must warn when a current inspection is unfinished'
  );
}

assertShared(liveApp, 'Live');
assertShared(stagingApp, 'Toets');

assert.ok(
  /fireSIsEmptyRecycleLeftoverPremises/.test(liveLists) &&
    /fireSIsEmptyRecycleLeftoverPremises/.test(stagingLists),
  'Home building count must use the same leftover rule on live and toets'
);
assert.ok(
  /const GATEWAY_COPY = 'Open, continue, search and manage inspections\.'/.test(liveFlow) &&
    /const GATEWAY_COPY = 'Open, continue, search and manage inspections\.'/.test(stagingFlow),
  'Global flow must pin the same Gateway sentence on live and toets'
);

assert.ok(
  /Toetsblad first, live only when asked/.test(agents) &&
    /Do \*\*not\*\* sit live until the user says so/.test(agents),
  'AGENTS.md must keep forward work on the toets-blad until sit live is asked'
);

console.log('toets-matches-live-workflow.test.js: ok');
