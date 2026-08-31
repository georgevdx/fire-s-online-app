'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const src = read('fire-s-one-instrument.js');
const stagingSrc = read('staging/fire-s-one-instrument.js');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveStarted = read('fire-s-get-started.js');
const stagingStarted = read('staging/fire-s-get-started.js');
const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const liveEnv = read('fire-s-env.js');
const stagingEnv = read('staging/fire-s-env.js');

assert.ok(/1\.3\.50-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.50-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.45'/.test(liveEnv),
  'Live Fire-S must be 1.3.45'
);

assert.strictEqual(src, stagingSrc, 'Live and toets must share the one-instrument module');
assert.ok(
  /fire-s-one-instrument\.js/.test(liveHtml) && /fire-s-one-instrument\.js/.test(stagingHtml),
  'Access pages must load the one-instrument script'
);
assert.ok(
  /Only one instrument at a time/.test(liveHtml) &&
    /Only one instrument at a time/.test(stagingHtml),
  'Access must say only one instrument at a time'
);
assert.ok(
  /claimThisInstrument/.test(liveStarted) && /claimThisInstrument/.test(stagingStarted),
  'Login must claim this instrument'
);
assert.ok(
  /scope: 'others'/.test(src) && /scope: 'local'/.test(src),
  'A second login must revoke other sessions, then the old instrument must sign out locally'
);
assert.ok(
  /fire-s:instrument-taken/.test(liveApp) && /fire-s:instrument-taken/.test(stagingApp),
  'Home must return to Access when this instrument is kicked'
);

function loadModule() {
  const store = {};
  const document = {
    listeners: {},
    dispatchEvent(ev) {
      const list = this.listeners[ev.type] || [];
      list.forEach(fn => fn(ev));
      return true;
    },
    addEventListener(type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    }
  };
  function CustomEvent(type, init) {
    this.type = type;
    this.detail = (init && init.detail) || {};
  }
  const sandbox = {
    window: {},
    globalThis: {},
    console,
    CustomEvent,
    document,
    localStorage: {
      getItem: key => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
      setItem: (key, value) => {
        store[key] = String(value);
      }
    },
    setInterval: () => 1,
    clearInterval: () => {},
    crypto: { randomUUID: () => 'instrument-aaa-111' }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.root = sandbox;
  vm.runInNewContext(src, sandbox);
  return { api: sandbox.fireSOneInstrument, sandbox, store, document };
}

(async function run() {
  const first = loadModule();
  const calls = { update: [], signOut: [] };
  const authA = {
    updateUser: async payload => {
      calls.update.push(payload);
      return { data: { user: { user_metadata: payload.data } }, error: null };
    },
    signOut: async opts => {
      calls.signOut.push(opts);
      return { error: null };
    },
    getUser: async () => ({
      data: { user: { user_metadata: { fire_s_instrument_id: 'instrument-aaa-111' } } },
      error: null
    })
  };
  const claimed = await first.api.claim({ auth: authA }, first.sandbox.localStorage);
  assert.strictEqual(claimed.instrumentId, 'instrument-aaa-111');
  assert.strictEqual(calls.update[0].data.fire_s_instrument_id, 'instrument-aaa-111');
  assert.ok(
    calls.signOut.some(opts => opts && opts.scope === 'others'),
    'Claim must sign other instruments out'
  );

  const second = loadModule();
  second.sandbox.crypto.randomUUID = () => 'instrument-bbb-222';
  let kicked = null;
  second.document.addEventListener('fire-s:instrument-taken', ev => {
    kicked = ev.detail;
  });
  const authB = {
    getUser: async () => ({
      data: { user: { user_metadata: { fire_s_instrument_id: 'instrument-aaa-111' } } },
      error: null
    }),
    signOut: async opts => {
      calls.signOut.push(opts);
      return { error: null };
    }
  };
  const check = await second.api.check({ auth: authB }, second.sandbox.localStorage);
  assert.strictEqual(check.kicked, true);
  assert.strictEqual(check.reason, 'taken');
  assert.ok(kicked, 'The old instrument must be told it was taken');
  assert.ok(
    calls.signOut.some(opts => opts && opts.scope === 'local'),
    'The old instrument must sign out locally, not globally'
  );

  const same = loadModule();
  same.store[same.api.STORAGE_KEY] = 'instrument-aaa-111';
  const stay = await same.api.check(
    {
      auth: {
        getUser: async () => ({
          data: { user: { user_metadata: { fire_s_instrument_id: 'instrument-aaa-111' } } },
          error: null
        })
      }
    },
    same.sandbox.localStorage
  );
  assert.strictEqual(stay.ok, true);
  assert.ok(!stay.kicked);

  console.log('one-instrument.test.js: ok');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
