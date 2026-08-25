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
const boot = read('fire-s-startup-stability.js');
const env = read('fire-s-env.js');

assert.ok(
  /class="boot-mark"/.test(html) && /id="fireSBootScreen"/.test(html),
  'App open must show a Fire-S splash before Access'
);
assert.ok(
  /BOOT_MIN_MS = 1100/.test(boot) &&
    /elapsed < BOOT_MIN_MS/.test(boot),
  'Splash must stay until the app has had time to load'
);
assert.ok(
  /var mode = 'login'/.test(started),
  'Access must start on Login after the splash'
);
assert.ok(
  /id="fireSLoginSubscribeBtn"/.test(html) &&
    /loginSubscribe\.addEventListener\('click', showRegister\)/.test(started),
  'Login must keep Subscribe as an option'
);
assert.ok(
  /paintLoginForm/.test(started) &&
    /loginBack\.style\.display = 'none'/.test(started),
  'Login is the first screen, not a step behind Subscribe'
);
assert.ok(
  /setHero\('Fire-S', 'LOGIN'/.test(roles) &&
    !/setHero\('Fire-S', 'SUBSCRIBE'/.test(roles),
  'Guest Home heading must be Login, not Subscribe'
);
assert.ok(
  /1\.3\.13/.test(env),
  'App version must move to 1.3.13 for login-after-splash'
);

console.log('login-after-splash.test.js: ok');
