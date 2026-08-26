/* ============================================================
   Fire-S Subscription screen (Owner)
   View or change the company package. Payment is not taken here.
   ============================================================ */
(function fireSSubscribeScreen() {
  'use strict';

  var wired = false;
  var mode = 'billing';

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

  function canAddSeat() {
    var role = homeRole();
    return (
      role === 'company_owner' ||
      role === 'owner' ||
      role === 'super_admin' ||
      role === 'manager'
    );
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

  function selectedInterval() {
    var cat = catalog();
    var billing = byId('fireSSubscribeBillingOptions');
    if (cat && cat.selectedIntervalFrom && billing) {
      return cat.selectedIntervalFrom(billing);
    }
    return cat && cat.currentIntervalId ? cat.currentIntervalId() : 'monthly';
  }

  function paintCurrent() {
    var cat = catalog();
    var interval = selectedInterval();
    var lines = cat && cat.bothPriceLines ? cat.bothPriceLines(interval) : null;
    var current = byId('fireSSubscribeCurrent');
    if (!current) return;
    if (lines) {
      current.innerHTML =
        '<strong class="' +
        (lines.selected === 'monthly' ? 'is-picked' : '') +
        '">' +
        lines.monthly +
        '</strong><strong class="' +
        (lines.selected === 'annual' ? 'is-picked' : '') +
        '">' +
        lines.annual +
        '</strong><span>Chosen: ' +
        (interval === 'annual' ? lines.annual : lines.monthly) +
        '. ' +
        lines.saveNote +
        ' You (the owner) pay. Inspectors do not. Phone and desktop share that email.</span>';
      return;
    }
    var price = cat && cat.priceLabel ? cat.priceLabel(interval) : 'R349 per subscription per month';
    current.innerHTML =
      '<strong>Fire-S seat · ' +
      price +
      '</strong><span>You (the owner) pay for every subscription. Inspectors do not pay. Phone and desktop share that email.</span>';
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
    if (mode === 'seat') {
      try {
        if (typeof window.fireSOpenCompanyTeam === 'function') {
          window.fireSOpenCompanyTeam({ keepAfterCreate: true });
          return;
        }
      } catch (_) {}
    }
    try {
      if (typeof window.showHome === 'function') window.showHome();
    } catch (_) {}
  }

  function paintMode() {
    var seat = byId('fireSSubscribeSeatPanel');
    var save = byId('fireSSubscribeSaveBtn');
    var back = byId('fireSSubscribeBackBtn');
    var heading = byId('fireSSubscribeHeading');
    var kicker = byId('fireSSubscribeKicker');
    var title = byId('fireSSubscribeTitle');
    var intro = byId('fireSSubscribeIntroCopy');
    var billingWrap = byId('fireSSubscribeBillingWrap');
    var isSeat = mode === 'seat';
    if (seat) seat.style.display = isSeat ? '' : 'none';
    if (billingWrap) billingWrap.style.display = '';
    if (save) {
      save.style.display = isSeat ? 'none' : '';
      save.hidden = isSeat;
    }
    if (back) back.textContent = isSeat ? 'Back to Personnel' : 'Back Home';
    if (heading) heading.textContent = isSeat ? 'New subscription' : 'Subscription';
    if (kicker) kicker.textContent = isSeat ? 'You pay for this email' : 'Paid seats';
    if (title) {
      title.textContent = isSeat
        ? 'Subscribe an Inspector or Manager'
        : 'Subscribe to Fire-S';
    }
    if (intro) {
      intro.innerHTML = isSeat
        ? 'Choose monthly or annual first (annual is 2 months free). Then type their email, choose Inspector or Manager, and tap <strong>Subscribe this email</strong>. You (the owner) pay. They do not pay and they never open this page.'
        : 'You (the owner) pay <strong>R349 per month</strong> or <strong>R3 490 per year</strong> per subscription. Inspectors and other staff do not pay. Phone and desktop share that login. The app does not take a card yet — Company S invoices you. No VAT is added (Company S is not registered for VAT). Read the <a href="terms.html" target="_blank" rel="noopener">Terms and conditions</a> and the <a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a>.';
    }
  }

  function openSubscribe() {
    openSubscribeScreen('billing');
  }

  function openSubscribePerson() {
    openSubscribeScreen('seat');
  }

  function openSubscribeScreen(nextMode) {
    mode = nextMode === 'seat' ? 'seat' : 'billing';
    if (mode === 'seat') {
      if (!canAddSeat()) {
        alert('Only the Owner or a Manager can subscribe a person.');
        return;
      }
    } else if (!canManage()) {
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
      if (!billing.__fireSPaintBound) {
        billing.__fireSPaintBound = true;
        billing.addEventListener('change', function () {
          paintCurrent();
        });
      }
    }
    paintMode();
    paintCurrent();
    setMessage('');
    var emailInput = byId('fireSSeatEmail');
    var roleSelect = byId('fireSSeatRole');
    if (mode === 'seat') {
      if (emailInput) {
        emailInput.value = '';
        try {
          emailInput.focus();
        } catch (_) {}
      }
      if (roleSelect) roleSelect.value = 'inspector';
    }
    try {
      if (typeof window.updateFloatingBackButton === 'function') {
        window.updateFloatingBackButton();
      }
    } catch (_) {}
  }

  async function subscribeSeat() {
    var emailInput = byId('fireSSeatEmail');
    var roleSelect = byId('fireSSeatRole');
    var email = String((emailInput && emailInput.value) || '')
      .trim()
      .toLowerCase();
    var role = String((roleSelect && roleSelect.value) || 'inspector').trim() || 'inspector';
    if (!email || email.indexOf('@') < 0) {
      setMessage('Enter a valid email address.', true);
      return;
    }
    if (typeof window.fireSAddPersonnelSeat !== 'function') {
      setMessage('Personnel is not ready. Wait a moment and try again.', true);
      return;
    }
    var cat = catalog();
    var billing = byId('fireSSubscribeBillingOptions');
    var seatBtn = byId('fireSSubscribeSeatBtn');
    if (seatBtn) seatBtn.disabled = true;
    setMessage('Subscribing this email. You (the owner) pay…');
    try {
      await window.fireSAddPersonnelSeat(email, role);
      if (cat && cat.persistCompanyPlan) {
        var intervalId = cat.selectedIntervalFrom ? cat.selectedIntervalFrom(billing) : 'monthly';
        try {
          await cat.persistCompanyPlan('standard', intervalId);
          paintCurrent();
        } catch (_) {}
      }
    } catch (err) {
      setMessage((err && err.message) || 'Could not subscribe that email.', true);
    } finally {
      if (seatBtn) seatBtn.disabled = false;
    }
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
    paintExpiryReminder();
  }

  function reminderRole() {
    var role = homeRole();
    return role === 'company_owner' || role === 'owner' || role === 'super_admin' || role === 'manager';
  }

  function paintExpiryReminder() {
    var box = byId('fireSExpiryReminder');
    if (!box) return;
    var cat = catalog();
    if (!reminderRole() || !cat || !cat.shouldShowExpiryReminder) {
      box.hidden = true;
      return;
    }
    if (!cat.shouldShowExpiryReminder()) {
      box.hidden = true;
      return;
    }
    var days = cat.daysUntilRenewal ? cat.daysUntilRenewal() : 0;
    var when = cat.formatLongDate ? cat.formatLongDate(cat.currentRenewsOn()) : cat.currentRenewsOn();
    var title = byId('fireSExpiryReminderTitle');
    var text = byId('fireSExpiryReminderText');
    var openBtn = byId('fireSExpiryReminderOpenBtn');
    if (title) {
      title.textContent = days < 0 ? 'Subscription overdue' : days === 0 ? 'Subscription due today' : 'Subscription due in one month';
    }
    if (text) {
      text.textContent =
        (days < 0
          ? 'Company S invoices you. Due date was ' + when + '.'
          : days === 0
            ? 'Company S invoices you today (' + when + ').'
            : 'Due on ' + when + '. Company S invoices you. Close this if it is in the way.') +
        ' Monthly is R349 per subscription. Annual is R3 490 (2 months free).';
    }
    if (openBtn) openBtn.style.display = canManage() ? '' : 'none';
    box.hidden = false;
  }

  function closeExpiryReminder() {
    var cat = catalog();
    try {
      if (cat && cat.dismissExpiryReminder) cat.dismissExpiryReminder();
    } catch (_) {}
    var box = byId('fireSExpiryReminder');
    if (box) box.hidden = true;
  }

  function refreshCardCopy() {
    var cat = catalog();
    var btn = byId('cmdSubscribeBtn');
    if (!btn) return;
    var interval = cat && cat.currentIntervalId ? cat.currentIntervalId() : 'monthly';
    var price = cat && cat.priceLabel ? cat.priceLabel(interval) : 'R349 per subscription per month';
    var title = btn.querySelector('.command-title');
    var copy = btn.querySelector('.command-copy');
    if (title) title.textContent = 'Subscription';
    if (copy) copy.textContent = 'R349 / month or R3 490 / year · 2 months free on annual.';
  }

  function wire() {
    if (wired) return;
    wired = true;
    var back = byId('fireSSubscribeBackBtn');
    var save = byId('fireSSubscribeSaveBtn');
    var btn = byId('cmdSubscribeBtn');
    var seatBtn = byId('fireSSubscribeSeatBtn');
    var reminderClose = byId('fireSExpiryReminderCloseBtn');
    var reminderOpen = byId('fireSExpiryReminderOpenBtn');
    if (back) back.addEventListener('click', goHome);
    if (save) save.addEventListener('click', savePlan);
    if (seatBtn) seatBtn.addEventListener('click', subscribeSeat);
    if (reminderClose) reminderClose.addEventListener('click', closeExpiryReminder);
    if (reminderOpen) {
      reminderOpen.addEventListener('click', function () {
        openSubscribe();
      });
    }
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
    paintExpiryReminder();
  }

  window.fireSOpenSubscribe = openSubscribe;
  window.fireSOpenSubscribePerson = openSubscribePerson;
  window.fireSSubscribeGoBack = goHome;
  window.fireSSetSubscribeMessage = setMessage;
  window.fireSRefreshSubscribeCard = refreshCardCopy;
  window.fireSPaintExpiryReminder = paintExpiryReminder;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('fire-s:auth-changed', function () {
    refreshCardCopy();
    paintExpiryReminder();
  });
})();
