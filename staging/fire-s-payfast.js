/* ============================================================
   Fire-S → PayFast checkout (toets-blad sandbox)
   Card details stay on PayFast. Live stays invoice-only until
   sit dit live and Johan’s own merchant numbers are in the app.
   Official PayFast sandbox credentials (not a live account):
   merchant_id 10000100 / merchant_key 46f0cd694581a
   ============================================================ */
(function fireSPayfast(root) {
  'use strict';

  var FIELD_ORDER = [
    'merchant_id',
    'merchant_key',
    'return_url',
    'cancel_url',
    'notify_url',
    'name_first',
    'name_last',
    'email_address',
    'cell_number',
    'm_payment_id',
    'amount',
    'item_name',
    'item_description',
    'custom_int1',
    'custom_int2',
    'custom_int3',
    'custom_int4',
    'custom_int5',
    'custom_str1',
    'custom_str2',
    'custom_str3',
    'custom_str4',
    'custom_str5',
    'email_confirmation',
    'confirmation_address',
    'payment_method',
    'subscription_type',
    'billing_date',
    'recurring_amount',
    'frequency',
    'cycles',
    'subscription_notify_email',
    'subscription_notify_webhook',
    'subscription_notify_buyer'
  ];

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
    return !!(e.isStaging && c.enabled && c.sandbox && c.merchantId && c.merchantKey && c.passphrase);
  }

  function processUrl() {
    return 'https://sandbox.payfast.co.za/eng/process';
  }

  function phpUrlEncode(value) {
    return encodeURIComponent(String(value == null ? '' : value).trim())
      .replace(/[!'()*]/g, function (ch) {
        return '%' + ch.charCodeAt(0).toString(16).toUpperCase();
      })
      .replace(/%20/g, '+')
      .replace(/%[0-9a-f]{2}/gi, function (hex) {
        return hex.toUpperCase();
      });
  }

  function md5hex(input) {
    var fn = root.md5;
    if (typeof fn !== 'function') {
      throw new Error('PayFast MD5 helper is missing');
    }
    return fn(String(input));
  }

  function signatureParamString(fields, passphrase) {
    var parts = [];
    FIELD_ORDER.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(fields, key)) return;
      var val = text(fields[key]);
      if (!val) return;
      parts.push(key + '=' + phpUrlEncode(val));
    });
    var getString = parts.join('&');
    if (text(passphrase)) getString += '&passphrase=' + phpUrlEncode(passphrase);
    return getString;
  }

  function generateSignature(fields, passphrase) {
    return md5hex(signatureParamString(fields, passphrase));
  }

  function formatAmount(rand) {
    var n = Number(rand);
    if (!isFinite(n) || n <= 0) n = 0;
    return n.toFixed(2);
  }

  function catalog() {
    try {
      return root.fireSSubscriptionCatalog || null;
    } catch (_) {
      return null;
    }
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

  function appBaseUrl() {
    try {
      var loc = root.location;
      var path = String((loc && loc.pathname) || '/');
      if (!/\/$/.test(path) && path.indexOf('.html') === -1) path += '/';
      var file = /index\.html$/i.test(path) ? path : path.replace(/\/?$/, '/') + 'index.html';
      return String(loc.protocol) + '//' + loc.host + file;
    } catch (_) {
      return 'https://georgevdx.github.io/fire-s-online-app/staging/index.html';
    }
  }

  function withPayfastQuery(status) {
    return appBaseUrl() + '?payfast=' + encodeURIComponent(status);
  }

  function paymentId(kind) {
    return (
      'fs-' +
      text(kind || 'sub').slice(0, 8) +
      '-' +
      Date.now().toString(36) +
      '-' +
      Math.floor(Math.random() * 1e6).toString(36)
    );
  }

  function buildFields(info) {
    var c = cfg();
    var interval = text(info && info.interval).toLowerCase() === 'annual' ? 'annual' : 'monthly';
    var amount = amountFor(interval);
    var kind = text(info && info.kind) || 'subscribe';
    var company = text(info && info.company) || 'Fire-S';
    var email = text(info && info.email).toLowerCase();
    var seatEmail = text(info && info.seatEmail).toLowerCase();
    var itemName =
      interval === 'annual' ? 'Fire-S annual login' : 'Fire-S monthly login';
    var desc =
      kind === 'seat'
        ? 'Extra login ' + (seatEmail || email)
        : 'Owner login ' + email;
    var fields = {
      merchant_id: text(c.merchantId),
      merchant_key: text(c.merchantKey),
      return_url: withPayfastQuery('ok'),
      cancel_url: withPayfastQuery('cancel'),
      email_address: email || 'test@test.com',
      m_payment_id: paymentId(kind),
      amount: amount,
      item_name: itemName,
      item_description: desc.slice(0, 255),
      custom_str1: company.slice(0, 255),
      custom_str2: email.slice(0, 255),
      custom_str3: interval,
      custom_str4: kind.slice(0, 255),
      custom_str5: (seatEmail || email).slice(0, 255),
      subscription_type: '1',
      recurring_amount: amount,
      frequency: interval === 'annual' ? '6' : '3',
      cycles: '0'
    };
    fields.signature = generateSignature(fields, c.passphrase);
    return fields;
  }

  function rememberCheckout(fields) {
    try {
      root.localStorage.setItem(
        'fireS.payfast.lastCheckout',
        JSON.stringify({
          id: fields.m_payment_id,
          amount: fields.amount,
          item: fields.item_name,
          at: Date.now()
        })
      );
    } catch (_) {}
  }

  function startCheckout(info) {
    if (!isEnabled()) {
      return { ok: false, reason: 'disabled' };
    }
    var fields = buildFields(info || {});
    rememberCheckout(fields);
    var doc = root.document;
    if (!doc || !doc.body) return { ok: false, reason: 'no-dom', fields: fields };
    var form = doc.createElement('form');
    form.method = 'POST';
    form.action = processUrl();
    form.acceptCharset = 'utf-8';
    form.style.display = 'none';
    Object.keys(fields).forEach(function (name) {
      var input = doc.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = fields[name];
      form.appendChild(input);
    });
    doc.body.appendChild(form);
    form.submit();
    return { ok: true, fields: fields };
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
      var url = new URL(loc.href);
      if (!url.searchParams.has('payfast')) return;
      url.searchParams.delete('payfast');
      var next = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash;
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
      doc.body.insertBefore(bar, doc.getElementById('fireSStagingBanner') ? doc.getElementById('fireSStagingBanner').nextSibling : doc.body.firstChild);
    }
    bar.className = 'fire-s-payfast-return is-' + status;
    bar.textContent =
      status === 'ok'
        ? 'PayFast sandbox received this payment. This login is now active and renews until you cancel. Company data stays saved.'
        : 'PayFast payment was cancelled. This company and its inspections stay saved. Open Subscription → Pay on PayFast when you are ready.';
    try {
      var cat = root.fireSSubscriptionCatalog;
      if (cat) {
        if (status === 'ok' && cat.markPaid) cat.markPaid();
        if (status === 'cancel' && cat.markUnpaid) cat.markUnpaid();
      }
    } catch (_) {}
    try {
      if (typeof root.fireSPaintSubscribeStatus === 'function') root.fireSPaintSubscribeStatus();
    } catch (_) {}
    stripPayfastQuery();
  }

  root.fireSPayfast = {
    isEnabled: isEnabled,
    processUrl: processUrl,
    phpUrlEncode: phpUrlEncode,
    generateSignature: generateSignature,
    signatureParamString: signatureParamString,
    md5hex: md5hex,
    amountFor: amountFor,
    payLabel: payLabel,
    buildFields: buildFields,
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
