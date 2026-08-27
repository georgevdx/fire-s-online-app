'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const helper = require('../fire-s-password-reset.js');
const stagingHelperSrc = read('staging/fire-s-password-reset.js');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveStarted = read('fire-s-get-started.js');
const stagingStarted = read('staging/fire-s-get-started.js');
const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const liveEnv = read('fire-s-env.js');
const stagingEnv = read('staging/fire-s-env.js');

assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.29'/.test(liveEnv),
  'Live Fire-S must be 1.3.29'
);
assert.ok(/1\.3\.35-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.35-toets');

assert.ok(
  /fire-s-password-reset\.js/.test(liveHtml) && /fire-s-password-reset\.js/.test(stagingHtml),
  'Live and toets must load the password-reset helper before the Access scripts'
);

assert.strictEqual(
  helper.LIVE_URL,
  'https://georgevdx.github.io/fire-s-online-app/'
);
assert.strictEqual(
  helper.TOETS_URL,
  'https://georgevdx.github.io/fire-s-online-app/staging/'
);
assert.ok(
  stagingHelperSrc.indexOf(helper.LIVE_URL) >= 0 &&
    stagingHelperSrc.indexOf(helper.TOETS_URL) >= 0,
  'Toets copy must use the same Fire-S web addresses, never localhost'
);

assert.strictEqual(
  helper.accessRedirectUrl({ isProduction: true, isStaging: false }, { origin: 'http://127.0.0.1:18765', pathname: '/' }),
  helper.LIVE_URL,
  'Live reset emails must always send people to GitHub Pages, not the laptop address'
);
assert.strictEqual(
  helper.accessRedirectUrl({ isProduction: false, isStaging: true }, { origin: 'http://127.0.0.1:18765', pathname: '/staging/' }),
  helper.TOETS_URL
);

const login = helper.parseAuthParams('', '');
assert.strictEqual(login.isRecovery, false);

const fromEmail = helper.parseAuthParams(
  '?token_hash=abc123&type=recovery',
  ''
);
assert.ok(fromEmail.isRecovery);
assert.strictEqual(fromEmail.tokenHash, 'abc123');
assert.strictEqual(fromEmail.type, 'recovery');

const fromHash = helper.parseAuthParams('', '#access_token=xyz&type=recovery');
assert.ok(fromHash.isRecovery);
assert.strictEqual(fromHash.type, 'recovery');
assert.strictEqual(fromHash.tokenHash, '');

const store = {};
const storage = {
  getItem: function (key) {
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
  },
  setItem: function (key, value) {
    store[key] = String(value);
  },
  removeItem: function (key) {
    delete store[key];
  }
};
const win = {};
const captured = helper.captureFromLocation(
  { search: '?token_hash=keep-me&type=recovery', hash: '' },
  storage,
  win
);
assert.ok(captured.isRecovery);
assert.strictEqual(win.__fireSPasswordRecovery, true);
assert.strictEqual(storage.getItem(helper.TOKEN_KEY), 'keep-me');
assert.ok(helper.isCaptured(storage, win, { search: '', hash: '' }));

let verifyCalls = 0;
const fakeSb = {
  auth: {
    verifyOtp: async function (opts) {
      verifyCalls += 1;
      assert.strictEqual(opts.token_hash, 'keep-me');
      assert.strictEqual(opts.type, 'recovery');
      return { data: { session: { access_token: 'ok' } }, error: null };
    },
    getSession: async function () {
      throw new Error('getSession must not run when a token_hash is waiting');
    }
  }
};

async function main() {
  assert.strictEqual(verifyCalls, 0, 'Opening the email link must not use the token yet (Outlook Safe Links)');

  await helper.ensureRecoverySession(fakeSb, storage);
  assert.strictEqual(verifyCalls, 1);
  assert.strictEqual(storage.getItem(helper.TOKEN_KEY), null);

  const emptyStorage = {
    getItem: function () {
      return null;
    },
    setItem: function () {},
    removeItem: function () {}
  };
  var failed = false;
  try {
    await helper.ensureRecoverySession(
      { auth: { getSession: async function () { return { data: {} }; } } },
      emptyStorage
    );
  } catch (err) {
    failed = true;
    assert.ok(/localhost:3000/.test(String(err && err.message)));
  }
  assert.ok(failed, 'Save without a reset session must fail');

  assert.ok(
    /ensureRecoverySession/.test(liveStarted) && /ensureRecoverySession/.test(stagingStarted),
    'Save new password must verify the email token, then set the password'
  );
  assert.ok(
    /captureFromLocation/.test(liveApp) && /captureFromLocation/.test(stagingApp),
    'The app must notice token_hash and type=recovery before the cloud client starts'
  );
  assert.ok(
    /not localhost:3000/.test(liveStarted) && /not localhost:3000/.test(stagingStarted),
    'Forgot password copy must say the email link cannot be localhost:3000'
  );
  assert.ok(/open the reset link/.test(liveStarted) && /open the reset link/.test(stagingStarted));
  console.log('password-reset-accurate.test.js: ok');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
