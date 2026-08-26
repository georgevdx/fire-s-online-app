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
      payBtn.style.display = on && mode !== 'seat' ? '' : 'none';
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
        ' Phone and desktop with the same email count as one login. Each extra person is another subscription. Pay on PayFast.</span>';
      return;
    }
    var price = cat && cat.priceLabel ? cat.priceLabel(interval) : 'R250 per month per login';
    current.innerHTML =
      '<strong>Fire-S seat · ' +
      price +
      '</strong><span>Subscription per month per login is R250. Phone and desktop with the same email count as one login. Each extra person is another subscription. Pay on PayFast.</span>';
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
        ? 'This person is another subscription: <strong>R250 per month per login</strong>, or <strong>R2 500 per year</strong>. Phone and desktop with the same email count as one login. After you tap Subscribe this email, pay that extra login on PayFast. They never open this page.'
        : 'Subscription per month per login is <strong>R250</strong>. Per year per login is <strong>R2 500</strong> (2 months free). Phone and desktop with the same email count as one login. Each extra person is another subscription. Pay on PayFast. Card details stay with PayFast. This toets-blad uses the PayFast sandbox (no real money). Read the <a href="terms.html" target="_blank" rel="noopener">Terms and conditions</a> and the <a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a>.';
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
          ? 'Due date was ' + when + '. Open Subscription to pay on PayFast.'
          : days === 0
            ? 'Due today (' + when + '). Open Subscription to pay on PayFast.'
            : 'Due on ' + when + '. Pay on PayFast from Subscription. Close this if it is in the way.');
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
    var btn = byId('cmdSubscribeBtn');
    if (!btn) return;
    var title = btn.querySelector('.command-title');
    var copy = btn.querySelector('.command-copy');
    if (title) title.textContent = 'Subscription';
    if (copy) copy.textContent = 'View or change monthly or annual billing. Pay this login on PayFast.';
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
    var reminderOpen = byId('fireSExpiryReminderOpenBtn');
    if (back) back.addEventListener('click', goHome);
    if (save) save.addEventListener('click', savePlan);
    if (payBtn) payBtn.addEventListener('click', payNow);
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
    paintPayfastControls();
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
