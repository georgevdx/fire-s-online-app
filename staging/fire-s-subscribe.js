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

  function payfast() {
    try {
      return window.fireSPayfast || null;
    } catch (_) {
      return null;
    }
  }

  function payfastOn() {
    var pf = payfast();
    return !!(pf && pf.isEnabled && pf.isEnabled());
  }

  function ownerEmail() {
    try {
      return String((window.currentUserProfile && window.currentUserProfile.email) || '')
        .trim()
        .toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function companyName() {
    try {
      return String(
        (window.currentUserProfile &&
          (window.currentUserProfile.companyName || window.currentUserProfile.company)) ||
          ''
      ).trim();
    } catch (_) {
      return '';
    }
  }

  function selectedBillingInterval() {
    var cat = catalog();
    var billing = byId('fireSSubscribeBillingOptions');
    if (cat && cat.selectedIntervalFrom) return cat.selectedIntervalFrom(billing);
    return (cat && cat.currentIntervalId && cat.currentIntervalId()) || 'monthly';
  }

  function paintPayfastControls() {
    var on = payfastOn();
    var pf = payfast();
    var payBtn = byId('fireSPayfastPayBtn');
    var hint = byId('fireSPayfastHint');
    var interval = selectedBillingInterval();
    if (payBtn) {
      var cancelled = catalog() && catalog().billingStatus && catalog().billingStatus() === 'cancelled';
      payBtn.style.display = on && mode !== 'seat' && !cancelled ? '' : 'none';
      payBtn.textContent = pf && pf.payLabel ? pf.payLabel(interval) : 'Pay on PayFast';
    }
    if (hint) hint.style.display = on ? '' : 'none';
  }

  function payNow() {
    var pf = payfast();
    if (!pf || !pf.startCheckout) {
      setMessage('PayFast is not ready on this page.', true);
      return;
    }
    var interval = selectedBillingInterval();
    var email = ownerEmail();
    if (!email) {
      setMessage('Sign in first, then pay on PayFast.', true);
      return;
    }
    setMessage('Opening PayFast…');
    pf.startCheckout({
      kind: 'subscribe',
      company: companyName() || 'Fire-S',
      email: email,
      interval: interval
    });
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
          ' Phone and desktop with the same email count as one login. Each extra person is another subscription. The main subscriber (owner) may invite inspectors to subscribe under the main company. Please see the user manual in Fire-S. Pay on PayFast.</span>';
      } else {
        var price = cat && cat.priceLabel ? cat.priceLabel(interval) : 'R250 per month per login';
        current.innerHTML =
          '<strong>Fire-S seat · ' +
          price +
          '</strong><span>Subscription per month per login is R250. Phone and desktop with the same email count as one login. Each extra person is another subscription. The main subscriber (owner) may invite inspectors to subscribe under the main company. Please see the user manual in Fire-S. Pay on PayFast.</span>';
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
    var againPanel = byId('fireSSubscribeAgainPanel');
    var save = byId('fireSSubscribeSaveBtn');
    if (!box) return;
    if (mode === 'seat' || !cat || !cat.statusHeadline) {
      box.hidden = true;
      if (cancelPanel) cancelPanel.hidden = true;
      if (againPanel) againPanel.hidden = true;
      return;
    }
    var status = cat.billingStatus ? cat.billingStatus() : 'unpaid';
    var cancelled = status === 'cancelled';
    box.hidden = false;
    box.className = 'fire-s-subscribe-status is-' + status;
    if (title) {
      title.textContent =
        status === 'active'
          ? 'Active subscription'
          : cancelled
            ? 'Cancelled'
            : 'Not paid yet';
    }
    if (copy) copy.textContent = cat.statusHeadline();
    if (keep) keep.textContent = cat.statusKeepDataNote();
    if (cancelPanel) cancelPanel.hidden = !canManage() || cancelled;
    if (againPanel) againPanel.hidden = !(canManage() && cancelled);
    if (cancelBtn) {
      cancelBtn.disabled = cancelled;
      cancelBtn.textContent = cancelled ? 'Already cancelled' : 'Cancel subscription';
    }
    if (save && mode !== 'seat') {
      save.style.display = cancelled ? 'none' : '';
      save.hidden = cancelled;
    }
    paintPayfastControls();
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
        '2. Auto-renew stops.\n' +
        '3. This login stays until ' +
        (when || 'the paid end date') +
        '.\n' +
        '4. Company name and inspections stay in the cloud.\n' +
        '5. You can subscribe again later on this page. Then pay on PayFast.'
    );
    if (!ok) return;
    cat.cancelBilling();
    setMessage('Cancelled. Auto-renew is off. Company name and inspections stay saved. Login with this same email to subscribe again.');
    paintSubscribeStatus();
    paintPayfastControls();
    refreshCardCopy();
    paintExpiryReminder();
  }

  async function subscribeAgain() {
    var cat = catalog();
    if (!canManage()) {
      setMessage('Only the Owner can subscribe again.', true);
      return;
    }
    if (!cat || !cat.reactivateBilling) return;
    if (cat.billingStatus && cat.billingStatus() !== 'cancelled') {
      setMessage('This subscription is already active.');
      paintSubscribeStatus();
      return;
    }
    var intervalId = selectedBillingInterval();
    var company = companyName();
    var ok = window.confirm(
      'Subscribe again with this same company name' +
        (company ? ' (' + company + ')' : '') +
        '?\n\n' +
        '1. The company name stays. Do not type a new name on Access.\n' +
        '2. Inspections stay in this same company.\n' +
        '3. Then pay on PayFast.\n' +
        '4. Status becomes Active after payment.'
    );
    if (!ok) return;
    cat.reactivateBilling(intervalId);
    setMessage('Subscribing again with this same company name…');
    try {
      if (cat.persistCompanyPlan) {
        await cat.persistCompanyPlan('standard', intervalId);
      }
    } catch (_) {}
    paintCurrent();
    paintSubscribeStatus();
    paintPayfastControls();
    refreshCardCopy();
    paintExpiryReminder();
    if (payfastOn()) {
      setMessage('Opening PayFast to subscribe again with this same company name…');
      payfast().startCheckout({
        kind: 'subscribe',
        company: company || 'Fire-S',
        email: ownerEmail(),
        interval: intervalId
      });
      return;
    }
    setMessage(
      'Subscribed again with this same company name. Inspections stay saved. Do not Subscribe on Access with a new name.'
    );
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
      var cancelled = catalog() && catalog().billingStatus && catalog().billingStatus() === 'cancelled';
      save.style.display = isSeat || cancelled ? 'none' : '';
      save.hidden = isSeat || cancelled;
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
        ? 'This person is another subscription: <strong>R250 per month per login</strong>, or <strong>R2 500 per year</strong>. Phone and desktop with the same email count as one login. The main subscriber (owner) may invite inspectors to subscribe under the main company. Please see the user manual in Fire-S. After you tap Subscribe this email, pay that extra login on PayFast. They never open this page.'
        : 'Subscription per month per login is <strong>R250</strong>. Per year per login is <strong>R2 500</strong> (2 months free). Phone and desktop with the same email count as one login. Only one instrument at a time may use that email. Each extra person is another subscription. The main subscriber (owner) may invite inspectors to subscribe under the main company. Please see the user manual in Fire-S. Pay on PayFast. Card details stay with PayFast. This toets-blad uses the PayFast sandbox (no real money). Read the <a href="terms.html" target="_blank" rel="noopener">Terms and conditions</a> and the <a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a>.';
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
          paintPayfastControls();
        });
      }
    }
    paintMode();
    paintCurrent();
    paintPayfastControls();
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
    setMessage('Subscribing this email. You pay this extra login…');
    try {
      await window.fireSAddPersonnelSeat(email, role);
      var intervalId = selectedBillingInterval();
      if (cat && cat.persistCompanyPlan) {
        try {
          await cat.persistCompanyPlan('standard', intervalId);
          paintCurrent();
        } catch (_) {}
      }
      if (payfastOn()) {
        setMessage('Opening PayFast for this extra login…');
        payfast().startCheckout({
          kind: 'seat',
          company: companyName() || 'Fire-S',
          email: ownerEmail(),
          seatEmail: email,
          interval: intervalId
        });
        return;
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
    paintPayfastControls();
    if (result && result.ok === false) {
      setMessage('Choice saved on this phone. Cloud save can wait — Company S still has the request.', true);
      return;
    }
    var price = cat.priceLabel ? cat.priceLabel(intervalId) : '';
    setMessage(
      payfastOn()
        ? 'Saved: ' + price + '. Tap Pay on PayFast for this login.'
        : 'Saved: ' + price + '.'
    );
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
    setMessage('Renewed. An annual subscription renews automatically until you cancel. Pay on PayFast if payment is due.');
    paintSubscribeStatus();
    paintPayfastControls();
  }

  function refreshCardCopy() {
    var btn = byId('cmdSubscribeBtn');
    if (!btn) return;
    var title = btn.querySelector('.command-title');
    var copy = btn.querySelector('.command-copy');
    if (title) title.textContent = 'Subscription';
    if (copy) {
      var cat = catalog();
      var cancelled = cat && cat.billingStatus && cat.billingStatus() === 'cancelled';
      copy.textContent = cancelled
        ? 'Cancelled. Subscribe again with this same company name. Do not type a new name on Access.'
        : cat && cat.statusHeadline
          ? cat.statusHeadline()
          : 'View or change monthly or annual billing. Pay this login on PayFast.';
    }
  }

  function wire() {
    if (wired) return;
    wired = true;
    var back = byId('fireSSubscribeBackBtn');
    var save = byId('fireSSubscribeSaveBtn');
    var payBtn = byId('fireSPayfastPayBtn');
    var btn = byId('cmdSubscribeBtn');
    var seatBtn = byId('fireSSubscribeSeatBtn');
    var reminderClose = byId('fireSExpiryReminderCloseBtn');
    var reminderRenew = byId('fireSExpiryReminderRenewBtn');
    var reminderCancel = byId('fireSExpiryReminderCancelBtn');
    var cancelBtn = byId('fireSSubscribeCancelBtn');
    var againBtn = byId('fireSSubscribeAgainBtn');
    if (back) back.addEventListener('click', goHome);
    if (save) save.addEventListener('click', savePlan);
    if (payBtn) payBtn.addEventListener('click', payNow);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelSubscription);
    if (againBtn) againBtn.addEventListener('click', subscribeAgain);
    if (seatBtn) seatBtn.addEventListener('click', subscribeSeat);
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
    paintPayfastControls();
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
