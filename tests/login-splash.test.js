'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveStarted = read('fire-s-get-started.js');
const stagingStarted = read('staging/fire-s-get-started.js');
const liveStartup = read('fire-s-startup-stability.js');
const stagingStartup = read('staging/fire-s-startup-stability.js');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');

function assertLoginSplash(src, label) {
  assert.ok(
    /function beginLoginInFlight\(/.test(src) &&
      /window\.__fireSLoggingIn = true/.test(src) &&
      /showLoginSplash\('Signing in…'\)/.test(src) &&
      /fireSHoldBoot/.test(src),
    label + ': Login tap must show the Fire-S splash immediately'
  );
  assert.ok(
    /function endLoginInFlight\(/.test(src) &&
      /window\.__fireSLoggingIn = false/.test(src) &&
      /hideLoginSplash\(\)/.test(src) &&
      /fireSRevealApp\('login-done'\)/.test(src),
    label + ': splash must hide only after the login in-flight flag clears'
  );
  assert.ok(
    /setLoginSplashCopy\('Loading your inspections…'\)/.test(src) &&
      /await syncCloudAfterAuth\(\);\s*enterAppHome\(/.test(src),
    label + ': Home must wait until cloud inspections have loaded'
  );
  assert.ok(
    !/Promise\.resolve\(syncCloudAfterAuth\(\)\)\.catch\(function \(\) \{\}\);/.test(src),
    label + ': Login must not open Home before the cloud download finishes'
  );
}

function assertStartupHold(src, label) {
  assert.ok(
    /function loginHoldsBoot\(/.test(src) &&
      /window\.__fireSLoggingIn/.test(src) &&
      /window\.fireSHoldBoot = holdBootForLogin/.test(src) &&
      /reason !== 'login-done'/.test(src),
    label + ': splash must stay up while Login is in flight'
  );
  assert.ok(
    /fire-s-booting'\) && !loginHoldsBoot\(\)/.test(src),
    label + ': login sync must run while the splash is showing'
  );
  assert.ok(
    /if \(!loginHoldsBoot\(\)\) scheduleReveal\('showHome', 180\)/.test(src) &&
      /if \(loginHoldsBoot\(\)\) return;[\s\S]*revealApp\('timeout'\)/.test(src),
    label + ': showHome and the 2.8s timeout must not dismiss the login splash'
  );
  assert.ok(
    /if \(reason === 'login-done'\) \{[\s\S]*hideSplashOverlay\('login-done'\)/.test(src) &&
      /hideSplashOverlay\('login-done'\);[\s\S]*return;/.test(src),
    label + ': login-done must only hide the splash, not reopen Access over Waiting'
  );
}

assertLoginSplash(liveStarted, 'Live Access');
assertLoginSplash(stagingStarted, 'Toets Access');
assertStartupHold(liveStartup, 'Live startup');
assertStartupHold(stagingStartup, 'Toets startup');

assert.ok(
  /fire-s-get-started\.js\?v=2-47-login-splash/.test(liveHtml) &&
    /fire-s-startup-stability\.js\?v=1-9-login-splash/.test(liveHtml),
  'Live must cache-bust the login splash scripts'
);
assert.ok(
  /fire-s-get-started\.js\?v=2-47-login-splash/.test(stagingHtml) &&
    /fire-s-startup-stability\.js\?v=1-9-login-splash/.test(stagingHtml),
  'Toets-blad must cache-bust the login splash scripts'
);

function makeClassList(initial) {
  const set = new Set(initial || []);
  return {
    add: function () {
      for (let i = 0; i < arguments.length; i += 1) set.add(arguments[i]);
    },
    remove: function () {
      for (let i = 0; i < arguments.length; i += 1) set.delete(arguments[i]);
    },
    contains: function (name) {
      return set.has(name);
    },
    values: function () {
      return Array.from(set);
    }
  };
}

function runStartupSandbox() {
  const classList = makeClassList(['fire-s-ready']);
  const html = { classList: classList, dataset: {} };
  const bootCopy = { textContent: 'Loading…' };
  const boot = {
    style: { display: 'none' },
    querySelector: function (sel) {
      return sel === 'p' ? bootCopy : null;
    }
  };
  const app = { style: { opacity: '1', pointerEvents: '' } };
  let originalSyncCalls = 0;
  const originalSync = function () {
    originalSyncCalls += 1;
    return Promise.resolve('synced');
  };
  let accessOpened = 0;
  const sandbox = {
    window: {},
    document: {
      readyState: 'complete',
      documentElement: html,
      getElementById: function (id) {
        return id === 'fireSBootScreen' ? boot : null;
      },
      querySelector: function (sel) {
        return sel === '.app' ? app : null;
      },
      addEventListener: function () {},
      querySelectorAll: function () {
        return [];
      }
    },
    Date: Date,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Set: Set,
    console: console
  };
  sandbox.window = sandbox;
  sandbox.window.refreshSyncData = originalSync;
  sandbox.window.showHome = function () {};
  sandbox.window.fireSShouldShowAccess = function () {
    return true;
  };
  sandbox.window.fireSOpenAccess = function () {
    accessOpened += 1;
  };
  sandbox.window.__fireSAuthSettled = true;
  vm.createContext(sandbox);
  vm.runInContext(liveStartup, sandbox, { filename: 'fire-s-startup-stability.js' });
  return {
    sandbox: sandbox,
    html: html,
    boot: boot,
    bootCopy: bootCopy,
    app: app,
    originalSync: originalSync,
    get originalSyncCalls() {
      return originalSyncCalls;
    },
    get accessOpened() {
      return accessOpened;
    }
  };
}

const runtime = runStartupSandbox();
runtime.sandbox.__fireSLoggingIn = true;
runtime.sandbox.fireSHoldBoot();
assert.ok(
  runtime.html.classList.contains('fire-s-booting') &&
    !runtime.html.classList.contains('fire-s-ready') &&
    runtime.bootCopy.textContent === 'Signing in…' &&
    runtime.app.style.opacity === '0',
  'Login tap must put the Fire-S splash back on screen'
);

runtime.sandbox.fireSRevealApp('timeout');
runtime.sandbox.fireSRevealApp('showHome');
assert.ok(
  runtime.html.classList.contains('fire-s-booting'),
  'timeout and showHome must not hide the splash while Login is in flight'
);

const syncWhileLogin = runtime.sandbox.refreshSyncData();
assert.ok(
  runtime.originalSyncCalls === 1 &&
    typeof syncWhileLogin.then === 'function',
  'cloud inspection download must run for real while the login splash is up'
);

runtime.sandbox.__fireSLoggingIn = false;
runtime.sandbox.fireSRevealApp('login-done');
assert.ok(
  !runtime.html.classList.contains('fire-s-booting') &&
    runtime.html.classList.contains('fire-s-ready') &&
    runtime.boot.style.display === 'none' &&
    runtime.app.style.opacity === '1' &&
    runtime.accessOpened === 0,
  'splash must hide after login is fully in, without reopening Access'
);

console.log('login-splash.test.js: ok');
