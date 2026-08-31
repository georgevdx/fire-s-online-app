/* ============================================================
   Fire-S: one subscribed email, one instrument at a time.
   Login on a second phone or computer claims this email and
   signs the first instrument out. Same email is still one paid
   subscription — this is not a second fee.
   ============================================================ */
(function fireSOneInstrument(root) {
  'use strict';

  var STORAGE_KEY = 'fireS.instrumentId';
  var META_KEY = 'fire_s_instrument_id';
  var CHECK_MS = 20000;
  var TAKEN_MESSAGE =
    'This subscribed email is already in use on another instrument. Only one instrument at a time. Login here to use this instrument. That signs the other one out.';

  var timer = null;
  var claiming = false;
  var kicking = false;

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function isRecovery() {
    try {
      if (root.__fireSPasswordRecovery) return true;
    } catch (_) {}
    try {
      if (root.sessionStorage && root.sessionStorage.getItem('fireS.passwordRecovery') === '1') {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function isLoginInFlight() {
    try {
      if (root.__fireSLoggingIn || root.__fireSClaimingInstrument) return true;
    } catch (_) {}
    return claiming;
  }

  function storageOf(storage) {
    return storage || root.localStorage;
  }

  function localId(storage) {
    var store = storageOf(storage);
    var id = '';
    try {
      id = text(store && store.getItem && store.getItem(STORAGE_KEY));
    } catch (_) {}
    if (id.length > 8) return id;
    try {
      if (root.crypto && typeof root.crypto.randomUUID === 'function') {
        id = root.crypto.randomUUID();
      }
    } catch (_) {}
    if (!id) {
      id = 'ins-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    }
    try {
      if (store && store.setItem) store.setItem(STORAGE_KEY, id);
    } catch (_) {}
    return id;
  }

  function userInstrumentId(user) {
    var meta = (user && (user.user_metadata || user.userMetadata)) || {};
    return text(meta[META_KEY]);
  }

  function isAuthGoneError(err) {
    var msg = text(err && (err.message || err.error_description || err)).toLowerCase();
    if (!msg) return false;
    return (
      msg.indexOf('session') >= 0 ||
      msg.indexOf('jwt') >= 0 ||
      msg.indexOf('token') >= 0 ||
      msg.indexOf('not authenticated') >= 0 ||
      msg.indexOf('invalid claim') >= 0
    );
  }

  function isNetworkError(err) {
    var msg = text(err && (err.message || err.error_description || err)).toLowerCase();
    return (
      msg.indexOf('failed to fetch') >= 0 ||
      msg.indexOf('network') >= 0 ||
      msg.indexOf('timeout') >= 0 ||
      msg.indexOf('offline') >= 0
    );
  }

  async function claim(sb, storage) {
    if (!sb || !sb.auth || isRecovery()) {
      return { claimed: false, skipped: true };
    }
    claiming = true;
    var id = localId(storage);
    var updateErr = null;
    try {
      var updated = await sb.auth.updateUser({ data: { fire_s_instrument_id: id } });
      if (updated && updated.error) updateErr = updated.error;
    } catch (err) {
      updateErr = err;
    } finally {
      claiming = false;
    }
    // Do not revoke other sessions from this phone. That can fire SIGNED_OUT
    // here and bounce Login back to Access. Other instruments leave when
    // their heartbeat sees a different instrument id.
    return { claimed: !updateErr, instrumentId: id, error: updateErr || null };
  }

  async function kick(sb, reason) {
    if (kicking) return { ok: false, kicked: true, reason: reason };
    if (isLoginInFlight()) return { ok: true, skipped: true, reason: reason || 'login' };
    kicking = true;
    stop();
    try {
      if (sb && sb.auth && typeof sb.auth.signOut === 'function') {
        await sb.auth.signOut({ scope: 'local' });
      }
    } catch (_) {}
    try {
      if (root.document && typeof root.document.dispatchEvent === 'function') {
        root.document.dispatchEvent(
          new CustomEvent('fire-s:instrument-taken', {
            detail: { message: TAKEN_MESSAGE, reason: reason || 'taken' }
          })
        );
      }
    } catch (_) {}
    kicking = false;
    return { ok: false, kicked: true, reason: reason || 'taken' };
  }

  async function check(sb, storage) {
    if (kicking || claiming || isLoginInFlight() || isRecovery()) return { ok: true, skipped: true };
    if (!sb || !sb.auth) return { ok: true, skipped: true };
    var id = localId(storage);
    var res;
    try {
      res = await sb.auth.getUser();
    } catch (err) {
      if (isNetworkError(err)) return { ok: true, skipped: true };
      if (isAuthGoneError(err)) return kick(sb, 'expired');
      return { ok: true, skipped: true };
    }
    if (res && res.error) {
      if (isNetworkError(res.error)) return { ok: true, skipped: true };
      if (isAuthGoneError(res.error)) return kick(sb, 'expired');
      return { ok: true, skipped: true };
    }
    var user = res && res.data && res.data.user;
    if (!user) return { ok: true, skipped: true };
    var remote = userInstrumentId(user);
    if (!remote) {
      claiming = true;
      try {
        await claim(sb, storage);
      } finally {
        claiming = false;
      }
      return { ok: true, claimed: true, instrumentId: id };
    }
    if (remote !== id) {
      return kick(sb, 'taken');
    }
    return { ok: true, instrumentId: id };
  }

  function start(sb, storage) {
    stop();
    if (!sb || isLoginInFlight()) return;
    Promise.resolve(check(sb, storage)).catch(function () {});
    if (typeof root.setInterval !== 'function') return;
    timer = root.setInterval(function () {
      Promise.resolve(check(sb, storage)).catch(function () {});
    }, CHECK_MS);
  }

  function stop() {
    if (timer && typeof root.clearInterval === 'function') {
      root.clearInterval(timer);
    }
    timer = null;
  }

  root.fireSOneInstrument = {
    STORAGE_KEY: STORAGE_KEY,
    META_KEY: META_KEY,
    TAKEN_MESSAGE: TAKEN_MESSAGE,
    CHECK_MS: CHECK_MS,
    localId: localId,
    userInstrumentId: userInstrumentId,
    claim: claim,
    check: check,
    kick: kick,
    start: start,
    stop: stop
  };
})(typeof window !== 'undefined' ? window : globalThis);
