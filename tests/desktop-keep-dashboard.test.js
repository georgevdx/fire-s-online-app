'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

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
    /fire-s-management-dashboard\.js\?v=1-10-dark-graphs/.test(liveHtml) &&
    /fire-s-get-started\.js\?v=2-55-paid-days/.test(liveHtml) &&
    /fire-s-env\.js\?v=1-3-67/.test(liveHtml),
  'Live must cache-bust the desktop landing fix'
);
assert.ok(
  /fire-s-desktop-access\.js\?v=1-4-subscribe-first/.test(stagingHtml) &&
    /fire-s-startup-stability\.js\?v=1-15-hira/.test(stagingHtml) &&
    /fire-s-management-dashboard\.js\?v=1-10-dark-graphs/.test(stagingHtml) &&
    /fire-s-get-started.js\?v=2-61-paid-days/.test(stagingHtml) &&
    /fire-s-env.js\?v=1-3-119-toets/.test(stagingHtml),
  'Toets-blad must cache-bust the desktop landing fix'
);

assert.strictEqual(liveDash, stagingDash, 'Live and toets management dashboard script must match');
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
assert.strictEqual(liveDashCss, stagingDashCss, 'Live and toets management dashboard styles must match');
assert.ok(
  /html\[data-fire-s-theme="dark"\] \.pbi-shell \.pbi-titlebar :is\(h3, p, span, button, div\)/.test(liveDashCss),
  'Dark title bar text must outrank the paper-island colour'
);
assert.ok(
  /fire-s-management-dashboard\.css\?v=1-6-dark-graphs/.test(liveHtml) &&
    /fire-s-management-dashboard\.css\?v=1-6-dark-graphs/.test(stagingHtml),
  'Dashboard styles must cache-bust with the dark graph update'
);

console.log('desktop-keep-dashboard.test.js: ok');
