'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveStarted = read('fire-s-get-started.js');
const stagingStarted = read('staging/fire-s-get-started.js');
const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const liveEnv = read('fire-s-env.js');
const stagingEnv = read('staging/fire-s-env.js');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');

assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.57'/.test(liveEnv),
  'Live Fire-S must be 1.3.57 for faster login align'
);
assert.ok(/1\.3\.63-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.63-toets');
assert.ok(
  /app\.js\?v=1-3-57-login-fast/.test(liveHtml) &&
    /fire-s-get-started\.js\?v=2-46-login-fast/.test(liveHtml) &&
    /fire-s-env\.js\?v=1-3-57-live/.test(liveHtml),
  'Live must cache-bust faster login align'
);
assert.ok(
  /app\.js\?v=1-3-63-login-fast/.test(stagingHtml) &&
    /fire-s-get-started\.js\?v=2-46-login-fast/.test(stagingHtml) &&
    /fire-s-env\.js\?v=1-3-63-toets/.test(stagingHtml),
  'Toets-blad must cache-bust faster login align'
);

function assertFasterLogin(src, label) {
  assert.ok(
    /await refreshMembership\(\);\s*if \(hasCompany\(\)\) return 1;/.test(src),
    label + ': returning users must load membership first and skip invite retries'
  );
  assert.ok(
    /Promise\.all\(jobs\)/.test(src) &&
      /claimThisInstrument\(sb\)/.test(src) &&
      /fireSFlushServiceRequests/.test(src),
    label + ': instrument claim and service flush must run together'
  );
  assert.ok(
    /enterAppHome\(/.test(src) &&
      /Promise\.resolve\(syncCloudAfterAuth\(\)\)\.catch\(function \(\) \{\}\);/.test(src),
    label + ': Home must open before cloud inspection download finishes'
  );
  assert.ok(
    !/await syncCloudAfterAuth\(\);\s*enterAppHome/.test(src),
    label + ': Login must not wait for the full inspection download before Home'
  );
}

function assertFasterSync(src, label) {
  assert.ok(
    /let refreshSyncInFlight = null;/.test(src) &&
      /if \(refreshSyncInFlight\) return refreshSyncInFlight;/.test(src),
    label + ': overlapping Refresh calls must share one in-flight sync'
  );
  assert.ok(
    /pendingCount = \(getPendingUploadQueue\(\) \|\| \[\]\)\.length;/.test(src) &&
      /if \(pendingCount > 0\) \{\s*await uploadPendingInspections\(\);/.test(src),
    label + ': login align must skip an empty first upload'
  );
  assert.ok(
    /await safeDownloadNewerCloudInspections\(\{ forcePaint: forcePaint \}\);/.test(src) &&
      /await uploadPendingInspections\(\);/.test(src),
    label + ': download still runs, then a trailing upload'
  );
}

assertFasterLogin(liveStarted, 'Live Access');
assertFasterLogin(stagingStarted, 'Toets Access');
assertFasterSync(liveApp, 'Live sync');
assertFasterSync(stagingApp, 'Toets sync');

console.log('login-align-faster.test.js: ok');
