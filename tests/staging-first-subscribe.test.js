'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const started = read('fire-s-get-started.js');
const roles = read('fire-s-clean-home-roles.js');
const html = read('index.html');
const reset = read('STAGING_RESET.sql');

assert.ok(
  /function isStagingEnv\(\)/.test(started),
  'Access must know when it is on the toets-blad'
);
assert.ok(
  /if \(isStagingEnv\(\)\) return true;/.test(started),
  'Toets-blad must allow first Subscribe without a company'
);
assert.ok(
  /Logged out: Login first/.test(started) &&
    /showLogin\(\)/.test(started) &&
    !/if \(isStagingEnv\(\) && !isRealUser\(\)\) \{\s*showRegister\(\);/.test(started),
  'Logged-out Access must open Login, not Subscribe'
);
assert.ok(
  /New company\? Subscribe/.test(html) &&
    /id="fireSLoginSubscribeBtn"/.test(html),
  'Login must offer Subscribe for a new company'
);
assert.ok(
  /function isAlreadyRegisteredError\(/.test(started),
  'Subscribe must recognise an email that already has a login'
);
assert.ok(
  /Signing in to finish Subscribe/.test(started),
  'Existing Supabase email must sign in and finish Subscribe'
);
assert.ok(
  /Use the same email you already use for Supabase/.test(started),
  'Toets-blad must tell the owner to reuse the Supabase email'
);
assert.ok(
  /Toets-blad · Access/.test(started),
  'Toets-blad Access kicker must stay Access, not first-time Subscribe'
);
assert.ok(
  /id="fireSRegisterSwitchToLoginBtn"/.test(html),
  'Subscribe form must keep a Login escape hatch'
);
assert.ok(
  /id="fireSRegisterNote"/.test(html),
  'Subscribe form must have a note the toets-blad can rewrite'
);
assert.ok(
  /setHero\('Fire-S', 'LOGIN'/.test(roles),
  'Guest home must start at Login, not Subscribe'
);
assert.ok(
  !/First Subscribe/.test(roles),
  'Guest home must not open on First Subscribe'
);
assert.ok(
  /johandb@live.com/.test(reset) && /georgevdx@gmail.com/.test(reset),
  'Reset SQL must keep the real Supabase emails'
);
assert.ok(
  /delete from auth\.users/.test(reset),
  'Reset SQL must delete extra test logins on Fire-S Test'
);
assert.ok(
  /fireye-sync/.test(reset) && /Do not run here/.test(reset),
  'Reset SQL must refuse to run on the live cloud'
);
assert.ok(
  /function signInAfterSignUp\(/.test(started),
  'Subscribe must sign in in the same tap when the cloud needs a second step'
);
assert.ok(
  /function finishPendingSubscribeIfAny\(/.test(started),
  'A started Subscribe must finish the company without filling the form again'
);
assert.ok(
  /fire_s_test_autoconfirm/.test(reset),
  'Reset SQL must confirm new Fire-S Test logins so Subscribe is one tap'
);
assert.ok(
  !/\+toets/.test(started) && !/\+toets/.test(html),
  'App copy must not invent extra +toets emails'
);

console.log('staging-first-subscribe.test.js: ok');
