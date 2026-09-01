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
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.48'/.test(liveEnv),
  'Live Fire-S must be 1.3.48'
);
assert.ok(/1\.3\.53-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.53-toets');

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

const fromHash = helper.parseAuthParams(
  '',
  '#access_token=xyz-token&refresh_token=xyz-refresh&type=recovery'
);
assert.ok(fromHash.isRecovery);
assert.strictEqual(fromHash.type, 'recovery');
assert.strictEqual(fromHash.tokenHash, '');
assert.strictEqual(fromHash.accessToken, 'xyz-token');
assert.strictEqual(fromHash.refreshToken, 'xyz-refresh');

const hashStore = {};
const hashStorage = {
  getItem: function (key) {
    return Object.prototype.hasOwnProperty.call(hashStore, key) ? hashStore[key] : null;
  },
  setItem: function (key, value) {
    hashStore[key] = String(value);
  },
  removeItem: function (key) {
    delete hashStore[key];
  }
};
helper.captureFromLocation(
  {
    search: '',
    hash: '#access_token=keep-access&refresh_token=keep-refresh&type=recovery'
  },
  hashStorage,
  {}
);
assert.strictEqual(hashStorage.getItem(helper.ACCESS_KEY), 'keep-access');
assert.strictEqual(hashStorage.getItem(helper.REFRESH_KEY), 'keep-refresh');
assert.ok(
  helper.isCaptured(hashStorage, {}, { search: '', hash: '#' }),
  'After the cloud strips the hash, Save must still have the access token'
);

function makeMemoryStorage(initial) {
  const mem = Object.assign({}, initial || {});
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    },
    setItem: function (key, value) {
      mem[key] = String(value);
    },
    removeItem: function (key) {
      delete mem[key];
    }
  };
}

const staleStorage = makeMemoryStorage();
staleStorage.setItem(helper.FLAG_KEY, '1');
const staleWin = { __fireSPasswordRecovery: true };
helper.captureFromLocation({ search: '', hash: '#' }, staleStorage, staleWin);
assert.strictEqual(staleStorage.getItem(helper.FLAG_KEY), null, 'stale recovery flag without a token must be cleared');
assert.strictEqual(staleWin.__fireSPasswordRecovery, false);
assert.ok(
  !helper.isCaptured(staleStorage, staleWin, { search: '', hash: '#' }),
  'Choose a new password must not stay open on a dead # page'
);

const liveFlagStorage = makeMemoryStorage();
liveFlagStorage.setItem(helper.FLAG_KEY, '1');
const liveFlagWin = { __fireSPasswordRecovery: true };
helper.captureFromLocation({ search: '', hash: '#' }, liveFlagStorage, liveFlagWin, true);
assert.strictEqual(liveFlagStorage.getItem(helper.FLAG_KEY), '1');
assert.ok(
  helper.isCaptured(liveFlagStorage, liveFlagWin, { search: '', hash: '#' }),
  'A live PASSWORD_RECOVERY flag must still show Choose a new password after the hash is cleaned'
);
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

  let setSessionCalls = 0;
  const hashSb = {
    auth: {
      setSession: async function (session) {
        setSessionCalls += 1;
        assert.strictEqual(session.access_token, 'keep-access');
        assert.strictEqual(session.refresh_token, 'keep-refresh');
        return { data: { session: session }, error: null };
      },
      getSession: async function () {
        throw new Error('getSession must not run when an access token is waiting');
      }
    }
  };
  await helper.ensureRecoverySession(hashSb, hashStorage);
  assert.strictEqual(setSessionCalls, 1);
  assert.strictEqual(hashStorage.getItem(helper.ACCESS_KEY), null);

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
    assert.ok(/newest email/.test(String(err && err.message)));
    assert.ok(/no longer has the reset code/.test(String(err && err.message)));
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
    /Fire-S opens/.test(liveStarted) && /Fire-S opens/.test(stagingStarted),
    'Forgot password copy must tell people to open the email link, not edit the address bar'
  );
  assert.ok(/open the reset link/.test(liveStarted) && /open the reset link/.test(stagingStarted));
  assert.ok(
    /no longer has the reset code/.test(liveStarted) && /no longer has the reset code/.test(stagingStarted),
    'Save on a dead reset page must tell the owner to keep #access_token='
  );
  assert.ok(
    /captureFromLocation\(window.location, window.sessionStorage, window, true\)/.test(liveStarted) &&
      /captureFromLocation\(window.location, window.sessionStorage, window, true\)/.test(stagingStarted),
    'Showing Choose a new password must not wipe a live recovery flag'
  );
  assert.ok(
    /function leaveReset\(\)/.test(liveStarted) &&
      /stripRecoveryFromAddress/.test(liveStarted) &&
      /history.replaceState/.test(liveStarted) &&
      /function leaveReset\(\)/.test(stagingStarted) &&
      /stripRecoveryFromAddress/.test(stagingStarted),
    'Cancel reset must return to Login without waiting for signOut'
  );
  assert.ok(
    /stale recovery flag/.test(read('fire-s-password-reset.js')) &&
      /stale recovery flag/.test(stagingHelperSrc),
    'Live and toets helpers must drop a leftover recovery flag without a token'
  );
  assert.ok(
    /isPasswordRecoveryNow/.test(read('fire-s-clean-home-roles.js')) &&
      /isPasswordRecoveryNow/.test(read('staging/fire-s-clean-home-roles.js')) &&
      /applyGuestHome\(\)/.test(read('fire-s-clean-home-roles.js')),
    'A recovery session must not open the owner Home before Save'
  );
  assert.ok(
    /fire-s-password-recovery #fireSGetStarted/.test(read('fire-s-get-started.css')) &&
      /fire-s-password-recovery #fireSGetStarted/.test(read('staging/fire-s-get-started.css')),
    'CSS must keep Choose a new password on screen while the recovery class is on'
  );
  assert.ok(
    /if \(isPasswordRecovery\(\)\) \{\s*showAccess\(\);/.test(liveStarted) &&
      /if \(isPasswordRecovery\(\)\) \{\s*showAccess\(\);/.test(stagingStarted),
    'hideAccess must not close the reset form during recovery'
  );
  assert.ok(
    /auth\.signOut/.test(liveStarted) &&
      /auth\.signOut/.test(stagingStarted) &&
      /Password saved\. Login with the new password/.test(liveStarted),
    'After Save, Fire-S must sign out the recovery session so Login is required'
  );
  console.log('password-reset-accurate.test.js: ok');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
