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
    if (current) {
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
          ' The main subscriber (owner) may invite inspectors to subscribe under the main company. Please see the user manual in Fire-S. Phone and desktop share that email.</span>';
      } else {
        var price = cat && cat.priceLabel ? cat.priceLabel(interval) : 'R250 per subscription per month';
        current.innerHTML =
          '<strong>Fire-S seat · ' +
          price +
          '</strong><span>The main subscriber (owner) may invite inspectors to subscribe under the main company. Please see the user manual in Fire-S. Phone and desktop share that email.</span>';
      }
    }
    paintSubscribeStatus();
  }

  function paintSubscribeStatus() {
    var cat = catalog();
    var box = byId('fireSSubscribeStatus');
    var title = byId('fireSSubscribeStatusTitle');
    var copy = byId('fireSSubscribeStatusCopy');
    var keep = byId('fireSSubscribeStatusKeep');
    var cancelPanel = byId('fireSSubscribeCancelPanel');
    var cancelBtn = byId('fireSSubscribeCancelBtn');
    if (!box) return;
    if (mode === 'seat' || !cat || !cat.statusHeadline) {
      box.hidden = true;
      if (cancelPanel) cancelPanel.hidden = true;
      return;
    }
    var status = cat.billingStatus ? cat.billingStatus() : 'unpaid';
    box.hidden = false;
    box.className = 'fire-s-subscribe-status is-' + status;
    if (title) {
      title.textContent =
        status === 'active'
          ? 'Active subscription'
          : status === 'cancelled'
            ? 'Cancelled'
            : 'Not paid yet';
    }
    if (copy) copy.textContent = cat.statusHeadline();
    if (keep) keep.textContent = cat.statusKeepDataNote();
    if (cancelPanel) cancelPanel.hidden = !canManage();
    if (cancelBtn) {
      cancelBtn.disabled = status === 'cancelled';
      cancelBtn.textContent = status === 'cancelled' ? 'Already cancelled' : 'Cancel subscription';
    }
  }

  function cancelSubscription() {
    var cat = catalog();
    if (!canManage()) {
      setMessage('Only the Owner can cancel this subscription.', true);
      return;
    }
    if (!cat || !cat.cancelBilling) return;
    if (cat.billingStatus && cat.billingStatus() === 'cancelled') {
      setMessage('This subscription is already cancelled. Company data stays saved.');
      paintSubscribeStatus();
      return;
    }
    var when = cat.formatLongDate ? cat.formatLongDate(cat.currentRenewsOn()) : cat.currentRenewsOn();
    var ok = window.confirm(
      'Cancel this subscription?\n\n' +
        '1. Only the Owner can cancel.\n' +
        '2. Company S stops invoicing for the next period.\n' +
        '3. This login stays until ' +
        (when || 'the paid end date') +
        '.\n' +
        '4. Company name and inspections stay in the cloud.\n' +
        '5. You can subscribe again later. Company S will invoice you.'
    );
    if (!ok) return;
    cat.cancelBilling();
    setMessage('Cancelled. Company S will not invoice for the next period. Company name and inspections stay saved.');
    paintSubscribeStatus();
    refreshCardCopy();
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
    var renewBtn = byId('fireSExpiryReminderRenewBtn');
    var cancelBtn = byId('fireSExpiryReminderCancelBtn');
    if (!reminderRole() || !cat || !cat.shouldShowExpiryReminder) {
      box.hidden = true;
      return;
    }
    if (cat.billingStatus && cat.billingStatus() === 'cancelled') {
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
    if (title) {
      title.textContent =
        days <= 0
          ? 'Subscription due today'
          : days === 1
            ? 'Subscription renews tomorrow'
            : 'Subscription renews in ' + days + ' days';
    }
    if (text) {
      text.textContent =
        (days <= 0 ? 'Due today (' + when + '). ' : 'Due on ' + when + '. ') +
        'An annual subscription renews automatically until you cancel. Tap Renew to keep this login, or Cancel subscription to stop. Company name and inspections stay saved.';
    }
    if (renewBtn) renewBtn.style.display = canManage() ? '' : 'none';
    if (cancelBtn) cancelBtn.style.display = canManage() ? '' : 'none';
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

  function renewFromReminder() {
    var cat = catalog();
    if (!canManage()) {
      setMessage('Only the Owner can renew this subscription.', true);
      return;
    }
    if (cat && cat.reactivateBilling) {
      cat.reactivateBilling(cat.currentIntervalId ? cat.currentIntervalId() : 'monthly');
    }
    closeExpiryReminder();
    openSubscribe();
    setMessage(
      'Renewed. An annual subscription renews automatically until you cancel. Company S invoices you. Company name and inspections stay saved.'
    );
    paintSubscribeStatus();
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
        ? 'Choose monthly or annual first (annual is 2 months free). Then type their email, choose Inspector or Manager, and tap <strong>Subscribe this email</strong>. The main subscriber (owner) may invite inspectors to subscribe under the main company. Please see the user manual in Fire-S. They never open this page.'
        : 'You (the owner) pay <strong>R250 per month</strong> or <strong>R2 500 per year</strong> per subscription. The main subscriber (owner) may invite inspectors to subscribe under the main company. Please see the user manual in Fire-S. Phone and desktop share that login. Only one instrument at a time may use that email. The app does not take a card yet — Fire-S invoices you. No VAT is added (Fire-S is not registered for VAT). Read the <a href="terms.html" target="_blank" rel="noopener">Terms and conditions</a> and the <a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a>.';
    }
    paintSubscribeStatus();
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
    paintSubscribeStatus();
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
    setMessage('Saved: ' + price + '. Company S invoices you (the owner). The main subscriber (owner) may invite inspectors to subscribe under the main company. Please see the user manual in Fire-S. No card was taken.');
    try {
      if (typeof window.fireSApplyCleanHomeRoles === 'function') {
        window.fireSApplyCleanHomeRoles();
      }
    } catch (_) {}
    paintSubscribeStatus();
    paintExpiryReminder();
  }

  function refreshCardCopy() {
    var btn = byId('cmdSubscribeBtn');
    if (!btn) return;
    var title = btn.querySelector('.command-title');
    var copy = btn.querySelector('.command-copy');
    if (title) title.textContent = 'Subscription';
    if (copy) copy.textContent = 'View or change monthly or annual billing. You (the owner) pay.';
  }

  function wire() {
    if (wired) return;
    wired = true;
    var back = byId('fireSSubscribeBackBtn');
    var save = byId('fireSSubscribeSaveBtn');
    var btn = byId('cmdSubscribeBtn');
    var seatBtn = byId('fireSSubscribeSeatBtn');
    var reminderClose = byId('fireSExpiryReminderCloseBtn');
    var reminderRenew = byId('fireSExpiryReminderRenewBtn');
    var reminderCancel = byId('fireSExpiryReminderCancelBtn');
    var cancelBtn = byId('fireSSubscribeCancelBtn');
    if (back) back.addEventListener('click', goHome);
    if (save) save.addEventListener('click', savePlan);
    if (seatBtn) seatBtn.addEventListener('click', subscribeSeat);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelSubscription);
    if (reminderClose) reminderClose.addEventListener('click', closeExpiryReminder);
    if (reminderRenew) reminderRenew.addEventListener('click', renewFromReminder);
    if (reminderCancel) reminderCancel.addEventListener('click', cancelSubscription);
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
    paintSubscribeStatus();
  }

  window.fireSOpenSubscribe = openSubscribe;
  window.fireSOpenSubscribePerson = openSubscribePerson;
  window.fireSSubscribeGoBack = goHome;
  window.fireSSetSubscribeMessage = setMessage;
  window.fireSRefreshSubscribeCard = refreshCardCopy;
  window.fireSPaintExpiryReminder = paintExpiryReminder;
  window.fireSPaintSubscribeStatus = paintSubscribeStatus;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('fire-s:auth-changed', function () {
    refreshCardCopy();
    paintExpiryReminder();
    paintSubscribeStatus();
  });
})();
