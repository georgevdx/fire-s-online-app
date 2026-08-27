/**
 * Fire-S password reset — one accurate path.
 *
 * - Email links must open Fire-S on GitHub Pages, never localhost:3000.
 * - token_hash in the URL is stored only. Outlook Safe Links may open the
 *   page in the background; we must NOT verify the token until Save.
 * - Save: verify the email token (if present), then set the new password.
 */
(function fireSPasswordReset(root) {
  'use strict';

  var FLAG_KEY = 'fireS.passwordRecovery';
  var TOKEN_KEY = 'fireS.recoveryTokenHash';
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
    var isRecovery = type === 'recovery' || !!tokenHash;
    return {
      type: type,
      tokenHash: tokenHash,
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

  function captureFromLocation(loc, storage, win) {
    var parsed = parseAuthParams(loc && loc.search, loc && loc.hash);
    if (!parsed.isRecovery) return parsed;
    try {
      if (win) win.__fireSPasswordRecovery = true;
    } catch (_) {}
    try {
      if (storage && storage.setItem) storage.setItem(FLAG_KEY, '1');
      if (parsed.tokenHash && storage && storage.setItem) {
        storage.setItem(TOKEN_KEY, parsed.tokenHash);
      }
    } catch (_) {}
    return parsed;
  }

  function isCaptured(storage, win, loc) {
    try {
      if (win && win.__fireSPasswordRecovery) return true;
      if (storage && storage.getItem && storage.getItem(FLAG_KEY) === '1') return true;
      if (storage && storage.getItem && storage.getItem(TOKEN_KEY)) return true;
    } catch (_) {}
    try {
      return parseAuthParams(loc && loc.search, loc && loc.hash).isRecovery;
    } catch (_) {
      return false;
    }
  }

  function readTokenHash(storage) {
    try {
      return text(storage && storage.getItem && storage.getItem(TOKEN_KEY));
    } catch (_) {
      return '';
    }
  }

  function clear(storage, win) {
    try {
      if (win) win.__fireSPasswordRecovery = false;
    } catch (_) {}
    try {
      if (storage && storage.removeItem) {
        storage.removeItem(FLAG_KEY);
        storage.removeItem(TOKEN_KEY);
      }
    } catch (_) {}
  }

  function recoveryLinkError() {
    return new Error(
      'Open the reset link from the new email. The link must open Fire-S on the web, not localhost:3000.'
    );
  }

  async function ensureRecoverySession(sb, storage) {
    var token = readTokenHash(storage);
    if (token) {
      if (!sb || !sb.auth || typeof sb.auth.verifyOtp !== 'function') {
        throw recoveryLinkError();
      }
      var verify = await sb.auth.verifyOtp({ token_hash: token, type: 'recovery' });
      if (verify && verify.error) throw verify.error;
      try {
        if (storage && storage.removeItem) storage.removeItem(TOKEN_KEY);
      } catch (_) {}
      return true;
    }
    try {
      var sessionRes = sb && sb.auth && (await sb.auth.getSession());
      if (sessionRes && sessionRes.data && sessionRes.data.session) return true;
    } catch (_) {}
    throw recoveryLinkError();
  }

  var api = {
    FLAG_KEY: FLAG_KEY,
    TOKEN_KEY: TOKEN_KEY,
    LIVE_URL: LIVE_URL,
    TOETS_URL: TOETS_URL,
    parseAuthParams: parseAuthParams,
    accessRedirectUrl: accessRedirectUrl,
    captureFromLocation: captureFromLocation,
    isCaptured: isCaptured,
    readTokenHash: readTokenHash,
    clear: clear,
    ensureRecoverySession: ensureRecoverySession,
    recoveryLinkError: recoveryLinkError
  };

  root.fireSPasswordReset = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
