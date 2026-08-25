/* ============================================================
   Fire-S — email Company S when a company subscribes
   or a paid seat is added. Does not block the owner.
   First live send asks Johan to click Activate in johandb@live.com.
   ============================================================ */
(function fireSSubscribeNotify(root) {
  'use strict';

  var COMPANY_S_EMAIL = 'johandb@live.com';
  var FORM_URL = 'https://formsubmit.co/ajax/' + COMPANY_S_EMAIL;

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function priceLine(interval) {
    var id = String(interval || '').toLowerCase();
    if (id === 'annual' || id === 'year' || id === 'yearly') {
      return 'Annual · R3 490 per email per year. No VAT (Company S is not VAT-registered).';
    }
    return 'Monthly · R349 per email per month. No VAT (Company S is not VAT-registered).';
  }

  function buildBody(info) {
    var kind = text(info && info.kind) || 'subscribe';
    var company = text(info && info.company) || '(not given)';
    var email = text(info && info.email) || '(not given)';
    var role = text(info && info.role) || 'Owner';
    var interval = text(info && info.interval) || 'monthly';
    var isSeat = kind === 'seat';
    return {
      _subject: isSeat
        ? 'Fire-S: new paid seat to invoice'
        : 'Fire-S: new company subscribed — invoice',
      _template: 'table',
      _captcha: 'false',
      event: isSeat ? 'New paid seat (Personnel)' : 'New Subscribe',
      company: company,
      person_email: email,
      role: role,
      billing: priceLine(interval),
      pay_how: 'Company S invoices. No card in the app. No VAT.',
      note: isSeat
        ? 'Add this email to the next Company S invoice.'
        : 'Create the first invoice for this owner.'
    };
  }

  function notifyCompanyS(info) {
    try {
      if (root.FIRE_S_ENV && root.FIRE_S_ENV.notifyCompanyS === false) {
        return Promise.resolve({ ok: false, skipped: 'staging' });
      }
    } catch (_) {}
    var body;
    try {
      body = buildBody(info || {});
    } catch (_) {
      return Promise.resolve({ ok: false });
    }
    return fetch(FORM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body)
    })
      .then(function () {
        return { ok: true };
      })
      .catch(function () {
        return { ok: false };
      });
  }

  root.fireSNotifyCompanyS = notifyCompanyS;
  root.fireSNotifyCompanySBuildBody = buildBody;
  root.fireSNotifyCompanySAddress = COMPANY_S_EMAIL;
})(window);
