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
const liveEnv = read('fire-s-env.js');
const stagingEnv = read('staging/fire-s-env.js');

function assertNoSyncHop(src, label) {
  assert.ok(
    /function isInspectionGatewayVisible\(/.test(src) &&
      /function shouldPaintProjectsAfterSync\(/.test(src),
    label + ': must know when the projects page is on screen'
  );
  assert.ok(
    /shouldPaintProjectsAfterSync\(false\)/.test(src),
    label + ': background sync must not rebuild the projects list while it is open'
  );
  const download = src.slice(
    src.indexOf('async function safeDownloadNewerCloudInspections'),
    src.indexOf('async function loadData()')
  );
  assert.ok(
    /shouldPaintProjectsAfterSync\(options && options\.forcePaint === true\)/.test(download),
    label + ': cloud download must not wipe the open projects list'
  );
  const refresh = src.slice(
    src.indexOf('async function refreshSyncData'),
    src.indexOf('async function uploadSync()')
  );
  assert.ok(
    /forcePaint === true/.test(refresh) &&
      /shouldPaintProjectsAfterSync\(forcePaint\)/.test(refresh),
    label + ': automatic Refresh after login/startup must not hop the projects page'
  );
  assert.ok(
    /refreshSyncData\(\{ forcePaint: true \}\)/.test(src),
    label + ': Sync Now must still rebuild the projects list'
  );
  assert.ok(
    !/addEventListener\('click', refreshSyncData\)/.test(src),
    label + ': Sync Now must not pass the click event into refreshSyncData'
  );
}

assertNoSyncHop(liveApp, 'Live');
assertNoSyncHop(stagingApp, 'Toets');

assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.55'/.test(liveEnv),
  'Live Fire-S must be 1.3.55'
);
assert.ok(/1\.3\.61-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.61-toets');
assert.ok(
  /app\.js\?v=1-3-55-gateway/.test(liveHtml) &&
    /fire-s-env\.js\?v=1-3-55-live/.test(liveHtml),
  'Live must cache-bust the projects sync-hop fix'
);
assert.ok(
  /app\.js\?v=1-3-61-gateway/.test(stagingHtml) &&
    /fire-s-env\.js\?v=1-3-61-toets/.test(stagingHtml),
  'Toets-blad must cache-bust the projects sync-hop fix'
);

console.log('projects-sync-hop.test.js: ok');
