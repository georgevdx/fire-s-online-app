/* ============================================================
   Fire-S → PayFast checkout
   Card details stay on PayFast. Signing and merchant secrets
   stay on the PayFast Edge Function. This file never holds a
   merchant key or passphrase. Toets stays sandbox. Live uses
   www.payfast.co.za when FIRE_S_ENV.payfast.mode is live.
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
    if (!c.enabled) return false;
    var mode = text(c.mode).toLowerCase();
    if (e.isStaging) return mode !== 'live';
    return mode === 'live';
  }

  function processUrl() {
    return text(cfg().mode).toLowerCase() === 'live'
      ? 'https://www.payfast.co.za/eng/process'
      : 'https://sandbox.payfast.co.za/eng/process';
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

  function ownerEmail() {
    try {
      return text(root.currentUserProfile && root.currentUserProfile.email).toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function hostedField(html, name) {
    var src = String(html || '');
    var named = new RegExp(
      "name=[\"']" + name + "[\"'][\\s\\S]{0,120}?value=[\"']([^\"']*)[\"']",
      'i'
    );
    var valued = new RegExp(
      "value=[\"']([^\"']*)[\"'][\\s\\S]{0,120}?name=[\"']" + name + "[\"']",
      'i'
    );
    var match = named.exec(src) || valued.exec(src);
    return match ? text(match[1]) : '';
  }

  function merchantPaysSelf(html) {
    var posted = hostedField(html, 'email_address').toLowerCase();
    var owner = ownerEmail();
    if (!posted || !owner) return false;
    return posted === owner;
  }

  function sameAccountBlockHtml() {
    return (
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fire-S PayFast</title></head>' +
      '<body style="font-family:Arial,sans-serif;max-width:40rem;margin:2rem auto;line-height:1.45">' +
      '<h1>PayFast cannot take this payment</h1>' +
      '<p>This checkout still uses the same email as the PayFast merchant. PayFast then shows 400: merchant is unable to receive payments from the same account.</p>' +
      '<p><strong>Run <code>SUPABASE_payfast_sandbox_buyer.sql</code> on Fire-S Test</strong>. Put the same sandbox Merchant ID, Merchant Key and <strong>Salt Passphrase</strong> already on payfast-checkout into <code>fire_s_payfast_sandbox_secrets</code>. Then open the toets-blad with <code>?v=205</code> and tap Pay on PayFast again.</p>' +
      '<p>Do not create a new company.</p>' +
      '<p><a href="./?v=205">Back to Fire-S</a></p>' +
      '</body></html>'
    );
  }

  function submitLiveForm(html) {
    var doc = root.document;
    if (!doc || !doc.createElement) return false;
    var parsedForm = null;
    try {
      if (root.DOMParser) {
        var parsed = new root.DOMParser().parseFromString(html, 'text/html');
        parsedForm = parsed && parsed.querySelector ? parsed.querySelector('form') : null;
      }
    } catch (_) {}
    if (!parsedForm) return false;
    var action = '';
    try {
      action = text(parsedForm.getAttribute && parsedForm.getAttribute('action')) || text(parsedForm.action);
    } catch (_) {}
    if (!action) action = processUrl();
    var live = doc.createElement('form');
    live.method = 'POST';
    live.action = action;
    try {
      live.setAttribute('accept-charset', 'utf-8');
      live.setAttribute('target', '_top');
    } catch (_) {}
    live.style.display = 'none';
    var inputs = [];
    try {
      inputs = parsedForm.querySelectorAll ? parsedForm.querySelectorAll('input') : [];
    } catch (_) {}
    var i;
    for (i = 0; i < inputs.length; i += 1) {
      var src = inputs[i];
      var inp = doc.createElement('input');
      inp.type = 'hidden';
      try {
        inp.name = text(src.name || (src.getAttribute && src.getAttribute('name')));
        inp.value =
          src.value != null ? String(src.value) : text(src.getAttribute && src.getAttribute('value'));
      } catch (_) {}
      if (inp.name) live.appendChild(inp);
    }
    if (doc.body) doc.body.appendChild(live);
    else if (doc.documentElement) doc.documentElement.appendChild(live);
    var submitFn =
      root.HTMLFormElement && root.HTMLFormElement.prototype && root.HTMLFormElement.prototype.submit;
    if (typeof submitFn === 'function') {
      submitFn.call(live);
      return true;
    }
    if (typeof live.submit === 'function') {
      live.submit();
      return true;
    }
    return false;
  }

  function submitHostedCheckout(html) {
    var doc = root.document;
    if (!doc) return { ok: false, reason: 'no-dom', error: 'PayFast is not ready on this page.' };
    if (merchantPaysSelf(html)) {
      try {
        if (typeof doc.open === 'function' && typeof doc.write === 'function') {
          doc.open();
          doc.write(sameAccountBlockHtml());
          doc.close();
        }
      } catch (_) {}
      return {
        ok: false,
        reason: 'same-account',
        error:
          'PayFast cannot take a payment from the merchant email. Run SUPABASE_payfast_sandbox_buyer.sql on Fire-S Test, then refresh with ?v=205 and tap Pay again.'
      };
    }
    // Full auto-submit HTML is what opened PayFast before. Write that page
    // first. Do not return success from a silent form.submit() and skip this.
    try {
      if (typeof doc.open === 'function' && typeof doc.write === 'function') {
        doc.open();
        doc.write(html);
        doc.close();
        return { ok: true };
      }
    } catch (_) {}
    try {
      if (submitLiveForm(html)) return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'dom', error: text(err && err.message) || 'PayFast did not open.' };
    }
    return { ok: false, reason: 'dom', error: 'PayFast did not open in this browser.' };
  }

  function companyId() {
    try {
      return text(root.currentUserProfile && root.currentUserProfile.companyId);
    } catch (_) {
      return '';
    }
  }

  async function sandboxSignedHtml(info) {
    var sb = root.supabaseClient;
    if (!sb || !sb.rpc) return '';
    var interval = text(info && info.interval).toLowerCase() === 'annual' ? 'annual' : 'monthly';
    var kind = text(info && info.kind) || 'subscribe';
    var res;
    try {
      res = await sb.rpc('fire_s_sandbox_payfast_html', {
        p_interval: interval,
        p_kind: kind
      });
    } catch (_) {
      return '';
    }
    if (res && res.error) return '';
    var data = res && res.data;
    if (typeof data === 'string' && /payfast/i.test(data)) return data;
    var row = Array.isArray(data) ? data[0] : data;
    return text(row && (row.html || row.out_html || row));
  }

  async function accessToken() {
    var sb = root.supabaseClient;
    if (!sb || !sb.auth || !sb.auth.getSession) return '';
    var res = await sb.auth.getSession();
    return text(res && res.data && res.data.session && res.data.session.access_token);
  }

  async function startCheckout(info) {
    if (!isEnabled()) {
      return { ok: false, reason: 'disabled', error: 'PayFast is not ready on this page.' };
    }
    var e = env();
    var url = checkoutUrl();
    if (!url) {
      return { ok: false, reason: 'no-function', error: 'PayFast is not ready on the server.' };
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
          seatEmail: text(info && info.seatEmail),
          companyName: text(info && info.company)
        })
      });
    } catch (err) {
      return { ok: false, reason: 'network', error: text(err && err.message) };
    }
    var type = text(res && res.headers && res.headers.get && res.headers.get('content-type'));
    var raw = '';
    try {
      raw = await res.text();
    } catch (_) {}
    if (res && res.ok && raw && (/text\/html/i.test(type) || /^\s*</.test(raw))) {
      if (merchantPaysSelf(raw)) {
        var sqlHtml = '';
        try {
          if (text(cfg().mode).toLowerCase() !== 'live') sqlHtml = await sandboxSignedHtml(info);
        } catch (_) {
          sqlHtml = '';
        }
        if (sqlHtml && !merchantPaysSelf(sqlHtml)) {
          return submitHostedCheckout(sqlHtml);
        }
      }
      return submitHostedCheckout(raw);
    }
    var errBody = {};
    try {
      errBody = JSON.parse(raw || '{}');
    } catch (_) {}
    var status = res && res.status ? String(res.status) : '';
    var serverErr = text(errBody.error);
    if (!serverErr && status === '401') serverErr = 'Sign in first, then pay on PayFast.';
    if (!serverErr && status === '403') serverErr = 'Only the Owner can pay on PayFast.';
    return {
      ok: false,
      reason: 'server',
      error: serverErr || 'PayFast is not ready on the server.' + (status ? ' (' + status + ')' : '')
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

  function hideReturnBanner() {
    try {
      var bar = root.document && root.document.getElementById('fireSPayfastReturnBanner');
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    } catch (_) {}
  }

  function subscriptionLooksCancelled() {
    try {
      var cat = root.fireSSubscriptionCatalog;
      if (cat && typeof cat.billingStatus === 'function' && cat.billingStatus() === 'cancelled') {
        return true;
      }
    } catch (_) {}
    try {
      var ent = root.fireSEntitlement;
      var snap = ent && typeof ent.snapshot === 'function' ? ent.snapshot() : null;
      var status = text(snap && snap.status).toLowerCase();
      var reason = text(snap && snap.reason).toLowerCase();
      if (
        status === 'subscription_cancelled' ||
        reason === 'subscription_cancelled' ||
        reason === 'cancelled_until_period_end'
      ) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function paintReturnBanner() {
    var status = queryStatus();
    if (subscriptionLooksCancelled() && status !== 'ok') {
      hideReturnBanner();
      if (status === 'cancel') stripPayfastQuery();
      return;
    }
    if (status !== 'ok' && status !== 'cancel') {
      if (subscriptionLooksCancelled()) hideReturnBanner();
      return;
    }
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
    submitHostedCheckout: submitHostedCheckout,
    queryStatus: queryStatus,
    paintReturnBanner: paintReturnBanner,
    hideReturnBanner: hideReturnBanner
  };

  if (root.document && root.document.body) {
    paintReturnBanner();
  } else if (root.document) {
    root.document.addEventListener('DOMContentLoaded', paintReturnBanner);
  }
})(window);
