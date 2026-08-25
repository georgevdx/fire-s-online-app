/* ============================================================
   Fire-S Subscription screen (Owner)
   View or change the company package. Payment is not taken here.
   ============================================================ */
(function fireSSubscribeScreen() {
  'use strict';

  var wired = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function catalog() {
    return window.fireSSubscriptionCatalog || null;
  }

  function homeRole() {
    try {
      if (typeof window.resolveFireSHomeRole === 'function') {
        return String(window.resolveFireSHomeRole() || '').toLowerCase();
      }
    } catch (_) {}
    return '';
  }

  function canManage() {
    var role = homeRole();
    return role === 'company_owner' || role === 'owner' || role === 'super_admin';
  }

  function setMessage(msg, isError) {
    var el = byId('fireSSubscribeMessage');
    if (!el) return;
    if (!msg) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = '';
    el.textContent = msg;
    el.className = 'fire-s-subscribe-message' + (isError ? ' is-error' : '');
  }

  function paintCurrent() {
    var cat = catalog();
    var interval = cat && cat.currentIntervalId ? cat.currentIntervalId() : 'monthly';
    var price = cat && cat.priceLabel ? cat.priceLabel(interval) : 'R349 per email per month';
    var current = byId('fireSSubscribeCurrent');
    if (!current) return;
    current.innerHTML =
      '<strong>Fire-S seat · ' +
      price +
      '</strong><span>You (the owner) pay for every subscribed email. Inspectors do not pay. Phone and desktop share that email.</span>';
  }

  function hideOtherSections() {
    [
      'homeSection',
      'servicesSection',
      'projectListSection',
      'projectFormSection',
      'findingsCentreSection',
      'companyTeamSection',
      'companyLetterheadSection',
      'testSamplesSection',
      'inspectorBoardSection',
      'userManualSection',
      'managementDashboardSection',
      'reportSection'
    ].forEach(function (id) {
      var el = byId(id);
      if (el) el.style.display = 'none';
    });
  }

  function goHome() {
    var section = byId('fireSSubscribeSection');
    if (section) section.style.display = 'none';
    try {
      if (typeof window.showHome === 'function') window.showHome();
    } catch (_) {}
  }

  function openSubscribe() {
    if (!canManage()) {
      alert('Only the Owner can open Subscription.');
      return;
    }
    hideOtherSections();
    var section = byId('fireSSubscribeSection');
    if (section) section.style.display = 'block';
    var cat = catalog();
    var billing = byId('fireSSubscribeBillingOptions');
    if (cat && cat.renderBillingPicker && billing) {
      billing.setAttribute('data-interval-name', 'fireSSubscribeBilling');
      cat.renderBillingPicker(billing, cat.currentIntervalId());
    }
    paintCurrent();
    setMessage('');
    try {
      if (typeof window.updateFloatingBackButton === 'function') {
        window.updateFloatingBackButton();
      }
    } catch (_) {}
  }

  async function savePlan() {
    var cat = catalog();
    var billing = byId('fireSSubscribeBillingOptions');
    if (!cat || !cat.persistCompanyPlan) {
      setMessage('Subscription list is not ready. Wait a moment and try again.', true);
      return;
    }
    var intervalId = cat.selectedIntervalFrom ? cat.selectedIntervalFrom(billing) : 'monthly';
    setMessage('Saving billing…');
    var result = await cat.persistCompanyPlan('standard', intervalId);
    paintCurrent();
    if (result && result.ok === false) {
      setMessage('Choice saved on this phone. Cloud save can wait — Company S still has the request.', true);
      return;
    }
    var price = cat.priceLabel ? cat.priceLabel(intervalId) : '';
    setMessage('Saved: ' + price + '. Company S invoices you (the owner). Inspectors do not pay. No card was taken.');
    try {
      if (typeof window.fireSApplyCleanHomeRoles === 'function') {
        window.fireSApplyCleanHomeRoles();
      }
    } catch (_) {}
  }

  function refreshCardCopy() {
    var cat = catalog();
    var btn = byId('cmdSubscribeBtn');
    if (!btn) return;
    var interval = cat && cat.currentIntervalId ? cat.currentIntervalId() : 'monthly';
    var price = cat && cat.priceLabel ? cat.priceLabel(interval) : 'R349 per email per month';
    var title = btn.querySelector('.command-title');
    var copy = btn.querySelector('.command-copy');
    if (title) title.textContent = 'Subscription';
    if (copy) copy.textContent = price + ' · tap to view or change.';
  }

  function wire() {
    if (wired) return;
    wired = true;
    var back = byId('fireSSubscribeBackBtn');
    var save = byId('fireSSubscribeSaveBtn');
    var btn = byId('cmdSubscribeBtn');
    if (back) back.addEventListener('click', goHome);
    if (save) save.addEventListener('click', savePlan);
    if (btn) {
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        openSubscribe();
      });
    }
  }

  function boot() {
    wire();
    refreshCardCopy();
  }

  window.fireSOpenSubscribe = openSubscribe;
  window.fireSRefreshSubscribeCard = refreshCardCopy;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('fire-s:auth-changed', refreshCardCopy);
})();
