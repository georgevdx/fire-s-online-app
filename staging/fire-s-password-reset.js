/**
 * Fire-S password reset — one accurate path.
 *
 * - Email links must open Fire-S on GitHub Pages, never localhost:3000.
 * - token_hash in the query is stored only. Outlook Safe Links may open the
 *   page in the background; we must NOT verify that token until Save.
 * - A leftover / stale recovery flag without a token must not keep "Choose a new
 *   password" on a dead page (address bar only #).
 */
(function fireSPasswordReset(root) {
  'use strict';

  var FLAG_KEY = 'fireS.passwordRecovery';
  var TOKEN_KEY = 'fireS.recoveryTokenHash';
  var ACCESS_KEY = 'fireS.recoveryAccessToken';
  var REFRESH_KEY = 'fireS.recoveryRefreshToken';
  var LIVE_URL = 'https://georgevdx.github.io/fire-s-online-app/';
  var TOETS_URL = 'https://georgevdx.github.io/fire-s-online-app/staging/';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function decodePart(value) {
    try {
      return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
    } catch (_) {
      return String(value || '');
    }
  }

  function parseAuthParams(search, hash) {
    search = String(search || '');
    hash = String(hash || '');
    var parts = [];
    if (search) parts.push(search.replace(/^\?/, ''));
    var hashBody = hash.replace(/^#/, '').replace(/^\?/, '');
    if (hashBody && (hashBody.indexOf('=') >= 0 || hashBody.indexOf('&') >= 0)) {
      parts.push(hashBody);
    }
    var params = {};
    parts
      .join('&')
      .split('&')
      .forEach(function (chunk) {
        if (!chunk) return;
        var cut = chunk.indexOf('=');
        var key = decodePart(cut < 0 ? chunk : chunk.slice(0, cut)).toLowerCase();
        var value = cut < 0 ? '' : decodePart(chunk.slice(cut + 1));
        if (key) params[key] = value;
      });
    var type = text(params.type).toLowerCase();
    var tokenHash = text(params.token_hash || params.tokenhash);
    var accessToken = text(params.access_token);
    var refreshToken = text(params.refresh_token);
    var isRecovery = type === 'recovery' || !!tokenHash;
    return {
      type: type,
      tokenHash: tokenHash,
      accessToken: accessToken,
      refreshToken: refreshToken,
      isRecovery: isRecovery
    };
  }

  function accessRedirectUrl(env, loc) {
    try {
      if (env && env.isStaging) return TOETS_URL;
      if (env && env.isProduction) return LIVE_URL;
    } catch (_) {}
    try {
      var path = String((loc && loc.pathname) || '/');
      path = path.replace(/index\.html$/i, '');
      if (!path.endsWith('/')) path += '/';
      return String((loc && loc.origin) || '') + path;
    } catch (_) {
      return LIVE_URL;
    }
  }

  function writeStore(storage, key, value) {
    try {
      if (!storage) return;
      if (value && storage.setItem) storage.setItem(key, value);
    } catch (_) {}
  }

  function readStore(storage, key) {
    try {
      return text(storage && storage.getItem && storage.getItem(key));
    } catch (_) {
      return '';
    }
  }

  function paintRecoveryClass(on, win) {
    try {
      var doc = (win && win.document) || (typeof document !== 'undefined' ? document : null);
      if (!doc) return;
      var root = doc.documentElement;
      var body = doc.body;
      var method = on ? 'add' : 'remove';
      if (root && root.classList) root.classList[method]('fire-s-password-recovery');
      if (body && body.classList) body.classList[method]('fire-s-password-recovery');
    } catch (_) {}
  }

  function captureFromLocation(loc, storage, win, keepFlag) {
    var parsed = parseAuthParams(loc && loc.search, loc && loc.hash);
    if (parsed.isRecovery) {
      try {
        if (win) win.__fireSPasswordRecovery = true;
      } catch (_) {}
      writeStore(storage, FLAG_KEY, '1');
      writeStore(storage, TOKEN_KEY, parsed.tokenHash);
      writeStore(storage, ACCESS_KEY, parsed.accessToken);
      writeStore(storage, REFRESH_KEY, parsed.refreshToken);
      paintRecoveryClass(true, win);
      return parsed;
    }
    // A leftover / stale recovery flag without a token keeps "Choose a new password"
    // on a dead page (address bar only #). Clear it on first load. Later
    // PASSWORD_RECOVERY may set the flag again; callers pass keepFlag then.
    if (!keepFlag && !readStore(storage, TOKEN_KEY) && !readStore(storage, ACCESS_KEY)) {
      try {
        if (win) win.__fireSPasswordRecovery = false;
      } catch (_) {}
      try {
        if (storage && storage.removeItem) storage.removeItem(FLAG_KEY);
      } catch (_) {}
      paintRecoveryClass(false, win);
    } else if (readStore(storage, TOKEN_KEY) || readStore(storage, ACCESS_KEY) || keepFlag) {
      paintRecoveryClass(true, win);
    }
    return parsed;
  }

  function isCaptured(storage, win, loc) {
    try {
      if (readStore(storage, TOKEN_KEY) || readStore(storage, ACCESS_KEY)) return true;
    } catch (_) {}
    try {
      if (parseAuthParams(loc && loc.search, loc && loc.hash).isRecovery) return true;
    } catch (_) {}
    try {
      if (readStore(storage, FLAG_KEY) === '1') return true;
    } catch (_) {}
    try {
      if (win && win.__fireSPasswordRecovery) return true;
    } catch (_) {}
    return false;
  }

  function clear(storage, win) {
    try {
      if (win) win.__fireSPasswordRecovery = false;
    } catch (_) {}
    try {
      if (storage && storage.removeItem) {
        storage.removeItem(FLAG_KEY);
        storage.removeItem(TOKEN_KEY);
        storage.removeItem(ACCESS_KEY);
        storage.removeItem(REFRESH_KEY);
      }
    } catch (_) {}
    paintRecoveryClass(false, win);
  }

  function recoveryLinkError() {
    return new Error(
      'This page no longer has the reset code. Close the tab. Open the newest email and use that link. Then Save.'
    );
  }

  function dropUsedTokens(storage) {
    try {
      if (!storage || !storage.removeItem) return;
      storage.removeItem(TOKEN_KEY);
      storage.removeItem(ACCESS_KEY);
      storage.removeItem(REFRESH_KEY);
    } catch (_) {}
  }

  async function ensureRecoverySession(sb, storage) {
    var token = readStore(storage, TOKEN_KEY);
    if (token) {
      if (!sb || !sb.auth || typeof sb.auth.verifyOtp !== 'function') {
        throw recoveryLinkError();
      }
      var verify = await sb.auth.verifyOtp({ token_hash: token, type: 'recovery' });
      if (verify && verify.error) throw verify.error;
      dropUsedTokens(storage);
      return true;
    }

    var accessToken = readStore(storage, ACCESS_KEY);
    var refreshToken = readStore(storage, REFRESH_KEY);
    if (accessToken && sb && sb.auth && typeof sb.auth.setSession === 'function') {
      var session = { access_token: accessToken };
      if (refreshToken) session.refresh_token = refreshToken;
      var setRes = await sb.auth.setSession(session);
      if (setRes && setRes.error) throw setRes.error;
      dropUsedTokens(storage);
      return true;
    }

    var i;
    for (i = 0; i < 4; i += 1) {
      try {
        var sessionRes = sb && sb.auth && (await sb.auth.getSession());
        if (sessionRes && sessionRes.data && sessionRes.data.session) return true;
      } catch (_) {}
    }
    throw recoveryLinkError();
  }

  var api = {
    FLAG_KEY: FLAG_KEY,
    TOKEN_KEY: TOKEN_KEY,
    ACCESS_KEY: ACCESS_KEY,
    REFRESH_KEY: REFRESH_KEY,
    LIVE_URL: LIVE_URL,
    TOETS_URL: TOETS_URL,
    parseAuthParams: parseAuthParams,
    accessRedirectUrl: accessRedirectUrl,
    captureFromLocation: captureFromLocation,
    isCaptured: isCaptured,
    paintRecoveryClass: paintRecoveryClass,
    readTokenHash: function (storage) {
      return readStore(storage, TOKEN_KEY);
    },
    clear: clear,
    ensureRecoverySession: ensureRecoverySession,
    recoveryLinkError: recoveryLinkError
  };

  root.fireSPasswordReset = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
