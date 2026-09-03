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
const liveSync = read('fire-s-simple-cloud-sync.js');
const stagingSync = read('staging/fire-s-simple-cloud-sync.js');

function superUserBlock(src) {
  const start = src.indexOf('const FIRE_S_SERVICE_REQUEST_SUPER_USERS = [');
  const end = src.indexOf('function canViewServiceRequests');
  assert.ok(start >= 0 && end > start, 'super user list must exist');
  return src.slice(start, end);
}

const liveBlock = superUserBlock(liveApp);
const stagingBlock = superUserBlock(stagingApp);

assert.ok(
  /georgevdx@gmail\.com/.test(liveBlock) &&
    /georgevdx@hotmail\.com/.test(liveBlock) &&
    /georgevdx@gmail\.com/.test(stagingBlock) &&
    /georgevdx@hotmail\.com/.test(stagingBlock),
  'Gmail and Hotmail must both be service-request super users'
);
assert.ok(
  /FIRE_S_SERVICE_REQUEST_SUPER_USERS\.indexOf\(currentEmail\) !== -1/.test(liveApp) &&
    /FIRE_S_SERVICE_REQUEST_SUPER_USERS\.indexOf\(currentEmail\) !== -1/.test(stagingApp),
  'Super user check must allow both emails'
);
assert.ok(
  /georgevdx@hotmail\.com/.test(liveHtml) &&
    /georgevdx@hotmail\.com/.test(stagingHtml) &&
    /georgevdx@gmail\.com/.test(liveHtml) &&
    /georgevdx@gmail\.com/.test(stagingHtml),
  'Services / Support must name both super user emails'
);
assert.ok(
  /georgevdx@hotmail\.com/.test(liveApp.slice(liveApp.indexOf('function isAllowedAdminEmail'))) &&
    /georgevdx@hotmail\.com/.test(stagingSync),
  'Hotmail must also count as an allowed admin email'
);
assert.ok(/1\.3\.54/.test(liveEnv), 'Live Fire-S must be 1.3.54');
assert.ok(/1\.3\.60-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.60-toets');
assert.ok(
  /app\.js\?v=1-3-54-gateway/.test(liveHtml) &&
    /fire-s-env\.js\?v=1-3-54-live/.test(liveHtml) &&
    /app\.js\?v=1-3-60-gateway/.test(stagingHtml) &&
    /fire-s-env\.js\?v=1-3-60-toets/.test(stagingHtml),
  'Live and toets must cache-bust the Hotmail super-user app'
);

console.log('hotmail-super-user.test.js: ok');
