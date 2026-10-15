'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveDesktop = read('fire-s-desktop-access.js');
const stagingDesktop = read('staging/fire-s-desktop-access.js');
const liveStartup = read('fire-s-startup-stability.js');
const stagingStartup = read('staging/fire-s-startup-stability.js');
const liveDash = read('fire-s-management-dashboard.js');
const stagingDash = read('staging/fire-s-management-dashboard.js');
const liveStarted = read('fire-s-get-started.js');
const stagingStarted = read('staging/fire-s-get-started.js');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveEnv = read('fire-s-env.js');
const stagingEnv = read('staging/fire-s-env.js');

function assertDesktopKeep(src, label) {
  assert.ok(
    /function landingShouldHold\(/.test(src) &&
      /function leaveDesktopDashboard\(/.test(src) &&
      /function wrapShowHome\(/.test(src) &&
      /fireSDesktopShowHome/.test(src) &&
      /if \(!leftByUser\) maybeOpenDesktopWorkspace\(\)/.test(src) &&
      !/openedThisLoad/.test(src),
    label + ': desktop=1 must reopen the Management dashboard after a later showHome'
  );
  assert.ok(
    /window\.fireSDesktopLandingActive = landingShouldHold/.test(src) &&
      /window\.fireSLeaveDesktopDashboard = leaveDesktopDashboard/.test(src),
    label + ': desktop landing helpers must be exported'
  );
}

assertDesktopKeep(liveDesktop, 'Live');
assertDesktopKeep(stagingDesktop, 'Toets');

function assertStartup(src, label) {
  assert.ok(
    /fireSDesktopLandingActive/.test(src) &&
      /keepDash \? \['managementDashboardSection'\] : \['homeSection'\]/.test(src),
    label + ': splash Home-only paint must keep the desktop dashboard'
  );
}

assertStartup(liveStartup, 'Live startup');
assertStartup(stagingStartup, 'Toets startup');

function assertGoHome(src, label) {
  assert.ok(
    /fireSLeaveDesktopDashboard/.test(src) &&
      /function goHome\(\) \{[\s\S]*fireSLeaveDesktopDashboard[\s\S]*showHome/.test(src),
    label + ': Back Home on the dashboard must stop auto-reopening it'
  );
}

assertGoHome(liveDash, 'Live dashboard');
assertGoHome(stagingDash, 'Toets dashboard');

function assertEnterHome(src, label) {
  const block = src.slice(src.indexOf('function enterAppHome'), src.indexOf('async function hasPendingInviteQuiet'));
  assert.ok(block.length > 50, label + ': enterAppHome must exist');
  const firstShow = block.indexOf("window.showHome === 'function'");
  const reopen = block.indexOf('fireSMaybeOpenDesktopWorkspace', firstShow);
  assert.ok(
    firstShow >= 0 && reopen > firstShow,
    label + ': after Access closes, desktop=1 must open the dashboard after showHome, not before'
  );
}

assertEnterHome(liveStarted, 'Live Access');
assertEnterHome(stagingStarted, 'Toets Access');

assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.67'/.test(liveEnv),
  'Live Fire-S must be 1.3.67'
);
assert.ok(/1\.3\.119-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.119-toets');
assert.ok(
  /fire-s-desktop-access\.js\?v=1-3-keep-dash/.test(liveHtml) &&
    /fire-s-startup-stability\.js\?v=1-14-sub-hold/.test(liveHtml) &&
    /fire-s-management-dashboard\.js\?v=1-11-completed-stats/.test(liveHtml) &&
    /fire-s-get-started\.js\?v=2-55-paid-days/.test(liveHtml) &&
    /fire-s-env\.js\?v=1-3-67/.test(liveHtml),
  'Live must cache-bust the desktop landing fix'
);
assert.ok(
  /fire-s-desktop-access\.js\?v=1-4-subscribe-first/.test(stagingHtml) &&
    /fire-s-startup-stability\.js\?v=1-15-hira/.test(stagingHtml) &&
    /fire-s-management-dashboard\.js\?v=1-13-fullscreen-scroll/.test(stagingHtml) &&
    /fire-s-get-started.js\?v=2-61-paid-days/.test(stagingHtml) &&
    /fire-s-env.js\?v=1-3-119-toets/.test(stagingHtml),
  'Toets-blad must cache-bust the desktop landing fix'
);

assert.ok(
  /function leaveFullscreen\(/.test(stagingDash) &&
    /shell\.classList\.add\('is-fullscreen'\)/.test(stagingDash) &&
    !/fullBleed/.test(stagingDash),
  'Toets full screen keeps the same charts and only changes the shell'
);
assert.ok(!/is-fullscreen/.test(liveDash), 'Live dashboard stays until this layout is sat live');
assert.ok(
  /value: completed \? Math\.round\(\(monthCompliant\[label\] \/ completed\) \* 100\) : null/.test(liveDash),
  'A month with no completed inspection must not plot as 0% compliance'
);
assert.ok(/function percentShares\(/.test(liveDash), 'Donut percents must use largest remainder');
assert.ok(
  /const total = all\.reduce/.test(liveDash),
  'Pareto running % must use every section, not only the bars on screen'
);
const liveDashCss = read('fire-s-management-dashboard.css');
const stagingDashCss = read('staging/fire-s-management-dashboard.css');
assert.ok(
  /html\[data-fire-s-theme="dark"\] \.pbi-shell \.pbi-titlebar :is\(h3, p, span, button, div\)/.test(liveDashCss) &&
    /html\[data-fire-s-theme="dark"\] \.pbi-shell \.pbi-titlebar :is\(h3, p, span, button, div\)/.test(stagingDashCss),
  'Dark title bar text must outrank the paper-island colour'
);
assert.ok(
  /\.pbi-shell:fullscreen[\s\S]{0,700}overflow-y: auto !important/.test(stagingDashCss) &&
    /\.pbi-shell:fullscreen \.pbi-chart-age[\s\S]{0,240}max-height: none/.test(stagingDashCss),
  'Toets full screen must scroll so the age axis, legend and lower charts stay reachable'
);
assert.ok(!/\.pbi-shell:fullscreen/.test(liveDashCss), 'Live dashboard styles stay until this layout is sat live');
assert.ok(
  /fire-s-management-dashboard\.css\?v=1-6-dark-graphs/.test(liveHtml),
  'Live dashboard styles keep their current cache key'
);
assert.ok(
  /fire-s-management-dashboard\.css\?v=1-8-fullscreen-scroll/.test(stagingHtml),
  'Toets dashboard styles must cache-bust the full-screen fit'
);

function loadDashboardCharts() {
  const sandbox = {
    window: {},
    document: {
      readyState: 'complete',
      getElementById() { return null; },
      addEventListener() {}
    },
    console
  };
  sandbox.window = sandbox;
  vm.runInNewContext(read('fire-s-management-dashboard.js'), sandbox);
  return sandbox.fireSDashboardCharts;
}

const charts = loadDashboardCharts();
const finalisedClear = {
  id: 'only',
  siteName: 'Sample',
  inspectionLifecycleStatus: 'finalised',
  inspectionStatus: 'finalised',
  archiveStatus: 'completed',
  inspectionFinalisedAt: '2026-10-08T10:00:00.000Z',
  inspectionDate: '2026-10-08',
  answers: [{ answer: 'Yes' }, { answer: 'Yes' }, { answer: 'N/A' }]
};
assert.strictEqual(charts.complianceStatus(finalisedClear), 'Compliant');
const clearOps = charts.computeOps([finalisedClear]);
assert.strictEqual(clearOps.portfolio.Compliant, 1);
assert.strictEqual(clearOps.portfolio['Not Yet Inspected'], 0);
assert.strictEqual(clearOps.compliancePct, 100);

const historyFindings = {
  id: 'hist',
  siteName: 'Sample',
  inspectionStatus: 'created',
  answers: [],
  inspectionHistory: [{
    completedAt: '2026-10-08T08:00:00.000Z',
    inspectionDate: '2026-10-08',
    answers: [{ answer: 'Yes' }, { answer: 'No' }]
  }]
};
assert.strictEqual(charts.complianceStatus(historyFindings), 'Action Required');
const findingOps = charts.computeOps([historyFindings]);
assert.strictEqual(findingOps.portfolio['Not Yet Inspected'], 0);
assert.strictEqual(findingOps.portfolio['Action Required'], 1);
assert.strictEqual(findingOps.compliancePct, 0);

assert.strictEqual(
  charts.complianceStatus({ id: 'blank', answers: [] }),
  'Not Yet Inspected'
);

console.log('desktop-keep-dashboard.test.js: ok');
