'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const stagingStartup = read('staging/fire-s-startup-stability.js');
const liveStartup = read('fire-s-startup-stability.js');
const flow = read('staging/fire-s-global-flow.js');
const started = read('staging/fire-s-get-started.js');
const html = read('staging/index.html');

assert.ok(/const BOOT_MIN_MS = 0;/.test(stagingStartup), 'Toets splash must not keep a minimum wait');
assert.ok(/const SPLASH_HOLD_MS = 0;/.test(stagingStartup), 'Toets splash must hide as soon as the screen is ready');
assert.ok(/const BOOT_MIN_MS = 0;/.test(liveStartup), 'Live splash must not keep a minimum wait');
assert.ok(/const SPLASH_HOLD_MS = 0;/.test(liveStartup), 'Live splash must hide as soon as the screen is ready');
assert.ok(/scheduleReveal\('home', 180\)/.test(stagingStartup), 'Login splash still waits until Home is asked to open');
assert.ok(/entitlementStillPending\(/.test(stagingStartup), 'Splash still waits for a real entitlement answer');
assert.ok(!/,\s*1800\)/.test(stagingStartup), 'Background sync must not wait 1.8s after the splash');

assert.ok(!/setTimeout\(settleAfterSplash, 900\)/.test(flow), 'Global flow must not reopen Access 900ms later');
assert.ok(!/setTimeout\(assertGatewayLabel, 1600\)/.test(flow), 'Gateway copy must not be corrected 1.6s later');
assert.ok(/if \(!window\.__fireSAuthSettled\) return;/.test(flow), 'Access opens only after the session check');
assert.ok(/pinGatewayAfter\(/.test(flow), 'Gateway sentence is pinned when Home paints');

assert.ok(
  /function boot\(\) \{\s*var already = wired;/.test(started),
  'Access boot retries must not paint the login form again'
);
assert.ok(/if \(userLeftHome\(\)\) return;/.test(started), 'A late Home paint must leave an open inspection alone');
assert.ok(
  /\(event === 'INITIAL_SESSION' \|\| event === 'TOKEN_REFRESHED'\) && session/.test(read('staging/app.js')) &&
    /\(event === 'INITIAL_SESSION' \|\| event === 'TOKEN_REFRESHED'\) && session/.test(read('app.js')),
  'A signed-out open must not show the other-instrument error'
);

assert.ok(!/client\.navigate\(/.test(read('staging/service-worker.js')), 'A new service worker must not reload the page');
const stagingApp = read('staging/app.js');
assert.ok(/if \(window\.__fireS136A10Installed\) return/.test(stagingApp), 'Older KPI writers must stop once the stable Home row is installed');
assert.ok(/data-fire-s-snapshot-html/.test(stagingApp), 'Gateway snapshot must not rewrite itself when the numbers are unchanged');
assert.ok(/footer\.textContent !== 'Open premises →'/.test(stagingApp), 'Premises cards must not be rewritten on every DOM change');
assert.ok(!/\[0, 80, 220, 520, 1000\]/.test(stagingApp), 'A KPI click must not repaint the gateway five times');
assert.ok(/btn\.getAttribute\('aria-label'\) !== label/.test(stagingApp), 'Command cards must keep their label when it is already correct');

assert.ok(/fire-s-startup-stability\.js\?v=1-16-ready/.test(html));
assert.ok(/fire-s-global-flow\.js\?v=1-2-calm/.test(html));
assert.ok(/fire-s-get-started\.js\?v=2-62-once/.test(html));

console.log('smooth-path.test.js: ok');
