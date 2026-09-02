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
  liveStarted: read('fire-s-get-started.js'),
  stagingStarted: read('staging/fire-s-get-started.js'),
  liveRoles: read('fire-s-clean-home-roles.js'),
  stagingRoles: read('staging/fire-s-clean-home-roles.js'),
  liveApp: read('app.js'),
  stagingApp: read('staging/app.js'),
  liveInstrument: read('fire-s-one-instrument.js'),
  stagingInstrument: read('staging/fire-s-one-instrument.js')
};

assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.51'/.test(liveEnv),
  'Live Fire-S must be 1.3.51 so one Login tap signs in'
);
assert.ok(/1\.3\.56-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.56-toets');

Object.keys(files).forEach(function (name) {
  const src = files[name];
  if (/Started$/.test(name)) {
    assert.ok(
      /function beginLoginInFlight\(/.test(src) &&
        /window\.__fireSLoggingIn = true/.test(src) &&
        /beginLoginInFlight\(\);/.test(src) &&
        /await finishSignedInSession\('Signed in\.'\)/.test(src) &&
        /endLoginInFlight\(\)/.test(src),
      name + ': Login must keep an in-flight flag until the session is finished'
    );
    assert.ok(
      /window\.__fireSClaimingInstrument = true/.test(src) &&
        /await api\.claim\(/.test(src) &&
        /api\.start\(/.test(src),
      name + ': this phone must claim the email before the heartbeat starts'
    );
  }
  if (/Roles$/.test(name)) {
    assert.ok(
      /__fireSLoggingIn \|\| window\.__fireSClaimingInstrument/.test(src),
      name + ': SIGNED_OUT during Login must not open Access again'
    );
  }
  if (/App$/.test(name)) {
    assert.ok(
      /event === 'INITIAL_SESSION' \|\| event === 'TOKEN_REFRESHED'/.test(src) &&
        !/event === 'SIGNED_IN' \|\| event === 'INITIAL_SESSION'/.test(src),
      name + ': SIGNED_IN must not start the one-instrument heartbeat'
    );
  }
  if (/Instrument$/.test(name)) {
    assert.ok(
      /function isLoginInFlight\(/.test(src) &&
        !/signOut\(\{ scope: 'others' \}\)/.test(src) &&
        /scope: 'local'/.test(src),
      name + ': claim must not sign this phone out; only a taken instrument signs out locally'
    );
  }
});

console.log('login-once.test.js: ok');
