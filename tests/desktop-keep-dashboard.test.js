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
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.53'/.test(liveEnv),
  'Live Fire-S must be 1.3.53'
);
assert.ok(/1\.3\.59-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.59-toets');
assert.ok(
  /fire-s-desktop-access\.js\?v=1-3-keep-dash/.test(liveHtml) &&
    /fire-s-startup-stability\.js\?v=1-8-desktop/.test(liveHtml) &&
    /fire-s-management-dashboard\.js\?v=1-7-desktop/.test(liveHtml) &&
    /fire-s-get-started\.js\?v=2-45-desktop/.test(liveHtml) &&
    /fire-s-env\.js\?v=1-3-53-live/.test(liveHtml),
  'Live must cache-bust the desktop landing fix'
);
assert.ok(
  /fire-s-desktop-access\.js\?v=1-3-keep-dash/.test(stagingHtml) &&
    /fire-s-startup-stability\.js\?v=1-8-desktop/.test(stagingHtml) &&
    /fire-s-management-dashboard\.js\?v=1-7-desktop/.test(stagingHtml) &&
    /fire-s-get-started\.js\?v=2-45-desktop/.test(stagingHtml) &&
    /fire-s-env\.js\?v=1-3-59-toets/.test(stagingHtml),
  'Toets-blad must cache-bust the desktop landing fix'
);

console.log('desktop-keep-dashboard.test.js: ok');
