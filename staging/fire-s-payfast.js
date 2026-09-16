/* ============================================================
   Fire-S → PayFast checkout (toets-blad)
   Card details stay on PayFast. Signing and merchant secrets
   stay on the PayFast Edge Function. This file never holds a
   merchant key or passphrase.
   ============================================================ */
(function fireSPayfast(root) {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function env() {
    try {
      return root.FIRE_S_ENV || {};
    } catch (_) {
      return {};
    }
  }

  function cfg() {
    var e = env();
    return (e && e.payfast) || {};
  }

  function isEnabled() {
    var c = cfg();
    var e = env();
    if (!e.isStaging) return false;
    if (!c.enabled) return false;
    if (text(c.mode).toLowerCase() === 'live') return false;
    return true;
  }

  function processUrl() {
    return 'https://sandbox.payfast.co.za/eng/process';
  }

  function catalog() {
    try {
      return root.fireSSubscriptionCatalog || null;
    } catch (_) {
      return null;
    }
  }

  function formatAmount(rand) {
    var n = Number(rand);
    if (!isFinite(n) || n <= 0) n = 0;
    return n.toFixed(2);
  }

  function amountFor(interval) {
    var cat = catalog();
    if (cat && typeof cat.priceFor === 'function') return formatAmount(cat.priceFor(interval));
    return text(interval).toLowerCase() === 'annual' ? '2500.00' : '250.00';
  }

  function payLabel(interval) {
    var annual = text(interval).toLowerCase() === 'annual';
    return annual ? 'Pay R2 500 on PayFast' : 'Pay R250 on PayFast';
  }

  function checkoutUrl() {
    var e = env();
    var name = text(cfg().checkoutFunction) || 'payfast-checkout';
    var base = text(e.supabaseUrl).replace(/\/$/, '');
    if (!base) return '';
    return base + '/functions/v1/' + name;
  }

  function rememberCheckout(meta) {
    try {
      root.localStorage.setItem(
        'fireS.payfast.lastCheckout',
        JSON.stringify({
          amount: meta && meta.amount,
          interval: meta && meta.interval,
          at: Date.now()
        })
      );
    } catch (_) {}
  }

  function companyId() {
    try {
      return text(root.currentUserProfile && root.currentUserProfile.companyId);
    } catch (_) {
      return '';
    }
  }

  async function accessToken() {
    var sb = root.supabaseClient;
    if (!sb || !sb.auth || !sb.auth.getSession) return '';
    var res = await sb.auth.getSession();
    return text(res && res.data && res.data.session && res.data.session.access_token);
  }

  async function startCheckout(info) {
    if (!isEnabled()) {
      return { ok: false, reason: 'disabled' };
    }
    var e = env();
    var url = checkoutUrl();
    if (!url) {
      return { ok: false, reason: 'no-function' };
    }
    var interval = text(info && info.interval).toLowerCase() === 'annual' ? 'annual' : 'monthly';
    var token = '';
    try {
      token = await accessToken();
    } catch (_) {}
    if (!token) {
      return { ok: false, reason: 'auth', error: 'Sign in first, then pay on PayFast.' };
    }
    rememberCheckout({ amount: amountFor(interval), interval: interval });
    var res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          apikey: text(e.supabaseAnonKey),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          kind: text(info && info.kind) || 'subscribe',
          interval: interval,
          company: text(info && info.company),
          companyId: text(info && info.companyId) || companyId(),
          seatEmail: text(info && info.seatEmail)
        })
      });
    } catch (err) {
      return { ok: false, reason: 'network', error: text(err && err.message) };
    }
    var type = text(res && res.headers && res.headers.get && res.headers.get('content-type'));
    if (res && res.ok && /text\/html/i.test(type)) {
      var html = await res.text();
      var doc = root.document;
      if (!doc || !doc.open) return { ok: false, reason: 'no-dom' };
      try {
        doc.open();
        doc.write(html);
        doc.close();
      } catch (err) {
        return { ok: false, reason: 'dom', error: text(err && err.message) };
      }
      return { ok: true };
    }
    var errBody = {};
    try {
      errBody = await res.json();
    } catch (_) {}
    return {
      ok: false,
      reason: 'server',
      error: text(errBody.error) || 'PayFast is not ready on the server.'
    };
  }

  function queryStatus() {
    try {
      var search = String((root.location && root.location.search) || '');
      var match = /(?:^|[?&])payfast=([^&]*)/.exec(search);
      return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : '';
    } catch (_) {
      return '';
    }
  }

  function stripPayfastQuery() {
    try {
      var loc = root.location;
      if (!loc || !root.history || !root.history.replaceState) return;
      var nextUrl = new URL(loc.href);
      if (!nextUrl.searchParams.has('payfast')) return;
      nextUrl.searchParams.delete('payfast');
      var next =
        nextUrl.pathname +
        (nextUrl.searchParams.toString() ? '?' + nextUrl.searchParams.toString() : '') +
        nextUrl.hash;
      root.history.replaceState({}, '', next);
    } catch (_) {}
  }

  function paintReturnBanner() {
    var status = queryStatus();
    if (status !== 'ok' && status !== 'cancel') return;
    var doc = root.document;
    if (!doc || !doc.body) return;
    var bar = doc.getElementById('fireSPayfastReturnBanner');
    if (!bar) {
      bar = doc.createElement('div');
      bar.id = 'fireSPayfastReturnBanner';
      bar.setAttribute('role', 'status');
      doc.body.insertBefore(
        bar,
        doc.getElementById('fireSStagingBanner')
          ? doc.getElementById('fireSStagingBanner').nextSibling
          : doc.body.firstChild
      );
    }
    bar.className = 'fire-s-payfast-return is-' + status;
    bar.textContent =
      status === 'ok'
        ? 'PayFast received this payment. Access updates when the server confirms. Company data stays saved.'
        : 'PayFast payment was cancelled. This company and its inspections stay saved. Open Subscription → Pay on PayFast when you are ready.';
    try {
      var cat = root.fireSSubscriptionCatalog;
      if (cat && status === 'cancel' && cat.markUnpaid) cat.markUnpaid();
    } catch (_) {}
    try {
      if (typeof root.fireSPaintSubscribeStatus === 'function') root.fireSPaintSubscribeStatus();
    } catch (_) {}
    try {
      if (status === 'ok' && root.fireSEntitlement && root.fireSEntitlement.refresh) {
        root.fireSEntitlement.refresh(true);
      }
    } catch (_) {}
    stripPayfastQuery();
  }

  root.fireSPayfast = {
    isEnabled: isEnabled,
    processUrl: processUrl,
    amountFor: amountFor,
    payLabel: payLabel,
    checkoutUrl: checkoutUrl,
    startCheckout: startCheckout,
    queryStatus: queryStatus,
    paintReturnBanner: paintReturnBanner
  };

  if (root.document && root.document.body) {
    paintReturnBanner();
  } else if (root.document) {
    root.document.addEventListener('DOMContentLoaded', paintReturnBanner);
  }
})(window);
