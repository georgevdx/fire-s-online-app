/* ============================================================
   Fire-S — email Company S when a company subscribes
   or the owner adds a new subscribed email. Does not block the owner.
   Company S invoices the owner — inspectors do not pay.
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
      return 'Annual · R2 500 per subscription per year. No VAT (Company S is not VAT-registered).';
    }
    return 'Monthly · R250 per subscription per month. No VAT (Company S is not VAT-registered).';
  }

  function billedToEmail(info) {
    var billed = text(info && (info.billedTo || info.billed_to || info.ownerEmail));
    if (billed) return billed;
    if (text(info && info.kind) === 'seat') return '(owner email missing)';
    return text(info && info.email) || '(not given)';
  }

  function buildBody(info) {
    var kind = text(info && info.kind) || 'subscribe';
    var company = text(info && info.company) || '(not given)';
    var email = text(info && info.email) || '(not given)';
    var role = text(info && info.role) || 'Owner';
    var interval = text(info && info.interval) || 'monthly';
    var isSeat = kind === 'seat';
    var billedTo = billedToEmail(info);
    return {
      _subject: isSeat
        ? 'Fire-S: new subscription — invoice the owner'
        : 'Fire-S: new company subscribed — invoice the owner',
      _template: 'table',
      _captcha: 'false',
      event: isSeat ? 'New subscription (new email)' : 'New Subscribe',
      company: company,
      billed_to: billedTo,
      person_email: email,
      role: role,
      billing: priceLine(interval),
      pay_how:
        'Company S invoices the OWNER for every subscribed email. Inspectors and other staff do not pay. No card in the app. No VAT.',
      note: isSeat
        ? 'This is a new subscription for this email. Invoice the owner (' +
          billedTo +
          '), not the inspector or staff email.'
        : 'First subscription. Invoice this owner.'
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

  function assignmentBody(info) {
    var company = text(info && info.company) || '(not given)';
    var organisation = text(info && info.organisation) || '(not given)';
    var site = text(info && info.site) || '(not given)';
    var address = text(info && info.address) || '(not given)';
    var date = text(info && info.date) || '(not given)';
    var contactName = text(info && info.contactName);
    var contactTel = text(info && info.contactTel);
    var contact = [contactName, contactTel].filter(Boolean).join(' · ') || '(not given)';
    var inspectionType = text(info && info.inspectionType) || 'General Fire Inspection';
    var occupancy = text(info && info.occupancy) || '(not given)';
    var scheduledBy = text(info && info.scheduledBy) || '(not given)';
    var inspectorName = text(info && info.inspectorName) || text(info && info.email);
    return {
      _subject: 'Fire-S: inspection booked for you — ' + site,
      _template: 'table',
      _captcha: 'false',
      event: 'Inspection assigned',
      inspector: inspectorName,
      company: company,
      organisation: organisation,
      premises: site,
      address: address,
      visit_date: date,
      inspection_type: inspectionType,
      occupancy: occupancy,
      site_contact: contact,
      scheduled_by: scheduledBy,
      note:
        'Open Fire-S. Home shows this booking under Scheduled priority. Inspection Gateway still lists company inspections.'
    };
  }

  function notifyInspectorAssignment(info) {
    var email = text(info && info.email).toLowerCase();
    if (!email || email.indexOf('@') < 1) {
      return Promise.resolve({ ok: false, skipped: 'no-email' });
    }
    var body;
    try {
      body = assignmentBody(info || {});
    } catch (_) {
      return Promise.resolve({ ok: false });
    }
    return fetch('https://formsubmit.co/ajax/' + encodeURIComponent(email), {
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

  root.fireSNotifyInspectorAssignment = notifyInspectorAssignment;
  root.fireSNotifyInspectorAssignmentBuildBody = assignmentBody;
})(window);
