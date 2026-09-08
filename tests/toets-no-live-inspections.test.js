'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const stagingEnv = read('staging/fire-s-env.js');
const stagingHtml = read('staging/index.html');
const liveHtml = read('index.html');
const agents = read('AGENTS.md');

const LIVE_CLOUD = 'https://ispsdmglyylcwkufphnv.supabase.co';
const TEST_CLOUD = 'https://ejqgzpkfcwocmtvwufwp.supabase.co';

assert.ok(
  /Never copy live inspections onto the toets-blad/.test(agents) &&
    /Never copy `fireyeProjects` into those keys/.test(agents),
  'AGENTS.md must forbid bringing live inspections onto the toets-blad'
);

assert.ok(
  /projectsStorageKey: staging \? 'fireyeProjectsStaging' : 'fireyeProjects'/.test(stagingEnv),
  'Toets env must keep a separate projects localStorage key'
);
assert.ok(
  /deletedProjectIdsKey: staging \? 'fireyeDeletedProjectIdsStaging'/.test(stagingEnv),
  'Toets env must keep a separate deleted-ids localStorage key'
);
assert.ok(
  /pendingUploadQueueKey: staging\s*\n\s*\? 'fireS_pending_upload_queue_staging'/.test(stagingEnv),
  'Toets env must keep a separate pending-upload queue'
);

assert.ok(
  /localStorage\.getItem\('fireyeProjects'\)/.test(liveApp),
  'Live must keep using fireyeProjects'
);
assert.ok(
  !/localStorage\.getItem\('fireyeProjects'\)/.test(stagingApp) &&
    !/localStorage\.setItem\('fireyeProjects'/.test(stagingApp),
  'Toets app.js must not read or write the live fireyeProjects key'
);
assert.ok(
  /Never read or copy live fireyeProjects/.test(stagingApp) &&
    /localStorage\.getItem\(fireSProjectsStorageKey\(\)\)/.test(stagingApp),
  'Toets getProjects must use the staging key helper'
);
assert.ok(
  !/getItem\(['"]fireyeProjects['"]\).*setItem\(fireSProjectsStorageKey/s.test(stagingApp) &&
    !/fireyeProjectsStaging.*=.*getItem\(['"]fireyeProjects['"]\)/.test(stagingApp),
  'Toets must not migrate live fireyeProjects into the staging key'
);

assert.ok(
  /app\.js\?v=1-3-64-split/.test(stagingHtml) &&
    /fire-s-env\.js\?v=1-3-64-split/.test(stagingHtml),
  'Toets-blad must cache-bust the inspection-store split'
);
assert.ok(
  !/1-3-64-split/.test(liveHtml),
  'Live cache tags must not include the toets inspection-store split'
);

function loadEnv(pathname) {
  const sandbox = {
    window: {},
    console,
    location: {
      protocol: 'https:',
      host: 'georgevdx.github.io',
      hostname: 'georgevdx.github.io',
      pathname: pathname,
      search: '',
      href: 'https://georgevdx.github.io' + pathname,
      hash: ''
    },
    document: {
      addEventListener: function () {},
      getElementById: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      },
      body: null
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(stagingEnv, sandbox);
  return sandbox.FIRE_S_ENV;
}

const toetsEnv = loadEnv('/fire-s-online-app/staging/');
assert.ok(toetsEnv.isStaging, 'Toets env must detect /staging/');
assert.strictEqual(toetsEnv.supabaseUrl, TEST_CLOUD);
assert.notStrictEqual(toetsEnv.supabaseUrl, LIVE_CLOUD);
assert.strictEqual(toetsEnv.projectsStorageKey, 'fireyeProjectsStaging');
assert.strictEqual(toetsEnv.deletedProjectIdsKey, 'fireyeDeletedProjectIdsStaging');
assert.strictEqual(toetsEnv.pendingUploadQueueKey, 'fireS_pending_upload_queue_staging');
assert.strictEqual(toetsEnv.lastBackupKey, 'fireyesaLastBackupStaging');
assert.strictEqual(toetsEnv.lastBackupJsonKey, 'fireyesaLastBackupJsonStaging');
assert.strictEqual(toetsEnv.storageKey, 'sb-fires-staging-auth');

const store = {};
const sandbox = {
  window: {
    FIRE_S_ENV: toetsEnv
  },
  FIRE_S_ENV: toetsEnv,
  JSON,
  String,
  localStorage: {
    getItem: key => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    }
  }
};
sandbox.window = Object.assign(sandbox.window, sandbox);
const helperStart = stagingApp.indexOf('function fireSProjectsStorageKey()');
const helperEnd = stagingApp.indexOf('function setProjects(projects)');
assert.ok(helperStart > 0 && helperEnd > helperStart, 'staging getProjects helpers must exist');
vm.runInNewContext(stagingApp.slice(helperStart, helperEnd), sandbox);

store.fireyeProjects = JSON.stringify([
  { id: 'live-1', projectName: 'Live premises from production' }
]);
const ignored = sandbox.getProjects();
assert.ok(Array.isArray(ignored), 'Toets getProjects must return a list');
assert.strictEqual(
  ignored.length,
  0,
  'Toets getProjects must ignore live fireyeProjects on the same origin'
);
assert.strictEqual(
  sandbox.fireSProjectsStorageKey(),
  'fireyeProjectsStaging',
  'Toets storage helper must not fall back to the live key'
);

store.fireyeProjectsStaging = JSON.stringify([
  { id: 'toets-1', projectName: 'Toets premises' }
]);
const toetsProjects = sandbox.getProjects();
assert.strictEqual(toetsProjects.length, 1);
assert.strictEqual(toetsProjects[0].id, 'toets-1');
assert.ok(
  !store.fireyeProjects.includes('toets-1'),
  'Toets reads must not write into the live inspection store'
);

console.log('toets-no-live-inspections.test.js: ok');
