'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveEnv = read('fire-s-env.js');
const stagingEnv = read('staging/fire-s-env.js');
const files = {
  liveRoles: read('fire-s-clean-home-roles.js'),
  stagingRoles: read('staging/fire-s-clean-home-roles.js'),
  liveStarted: read('fire-s-get-started.js'),
  stagingStarted: read('staging/fire-s-get-started.js'),
  liveApp: read('app.js'),
  stagingApp: read('staging/app.js')
};

assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.51'/.test(liveEnv),
  'Live Fire-S must be 1.3.51 so signed-out Access is shown'
);
assert.ok(/1\.3\.56-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.56-toets');

Object.keys(files).forEach(function (name) {
  const src = files[name];
  if (/Roles$/.test(name)) {
    assert.ok(
      /function hasStoredAuthSession\(/.test(src) &&
        /hasStoredAuthSession\(\)/.test(src) &&
        /fireSClearStickyHomeRole/.test(src),
      name + ': sticky Owner Home must not survive after the auth token is gone'
    );
    assert.ok(
      /event === 'SIGNED_OUT'/.test(src) &&
        /fireSShowAccessLogin/.test(src) &&
        /__fireSLoggingIn/.test(src),
      name + ': SIGNED_OUT must open Access / Login, except while Login is in flight'
    );
  }
  if (/Started$/.test(name)) {
    assert.ok(
      /function showLogin\(\) \{\s*mode = 'login';\s*showAccess\(\);/.test(src),
      name + ': Login form must un-hide the Access page'
    );
    assert.ok(
      /window\.fireSShowAccessLogin = function fireSShowAccessLogin\(/.test(src),
      name + ': logout must be able to force Access Login'
    );
  }
  if (/App$/.test(name)) {
    assert.ok(
      /fireSClearStickyHomeRole/.test(src) &&
        /fireSShowAccessLogin\(accessNote/.test(src) &&
        /applyLoggedOutUi\(accessNote\)/.test(src) &&
        /applyLoggedOutUi\(msg\)/.test(src),
      name + ': applyLoggedOutUi must clear the sticky role and show Access'
    );
  }
});

console.log('logout-returns-access.test.js: ok');
