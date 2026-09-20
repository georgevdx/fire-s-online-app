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
    var reactivate = byId('fireSBillingSubscribeBtn');
    var actions = byId('fireSSubscribePayActions');
    var showPay = on && mode !== 'seat';
    if (payBtn) {
      payBtn.style.display = showPay ? '' : 'none';
      payBtn.hidden = !showPay;
      payBtn.textContent = pf && pf.payLabel ? pf.payLabel(interval) : 'Pay on PayFast';
    }
    if (reactivate) {
      reactivate.style.display = mode === 'seat' ? 'none' : '';
      reactivate.hidden = mode === 'seat';
    }
    if (actions) {
      actions.hidden = mode === 'seat';
      actions.style.display = mode === 'seat' ? 'none' : '';
    }
    if (hint) hint.style.display = showPay ? '' : 'none';
  }

  function linkedCompanyId() {
    try {
      return String(
        (window.currentUserProfile && window.currentUserProfile.companyId) ||
          (window.currentCompanyAccess && window.currentCompanyAccess.companyId) ||
          ''
      ).trim();
    } catch (_) {
      return '';
    }
  }

  function noCompanyPayMessage() {
    return (
      'PayFast bills the company already linked to this login. ' +
      'Cancelled company: Login with the same owner email, then Subscribe / Reactivate. ' +
      'New business: Access → Subscribing New Company → type the company name. That creates the company. Then pay on PayFast.'
    );
  }

  function paintCompanyLine() {
    var el = byId('fireSSubscribeCompanyLine');
    if (!el) return;
    var name = companyName();
    var cid = linkedCompanyId();
    if (cid && name) {
      el.hidden = false;
      el.textContent = 'This login pays for ' + name + '. Subscribe / Reactivate does not pick a new name.';
      return;
    }
    if (cid) {
      el.hidden = false;
      el.textContent =
        'This login already has a company. Subscribe / Reactivate bills that same company. It does not create a new name.';
      return;
    }
    el.hidden = false;
    el.textContent = noCompanyPayMessage();
  }

  function preparePayCompany() {
    var sb = window.supabaseClient;
    var cid = linkedCompanyId();
    if (!sb || !sb.rpc) return Promise.resolve();
    return Promise.resolve(
      sb.rpc('fire_s_prepare_payfast_company', cid ? { p_company_id: cid } : {})
    )
      .then(function (res) {
        if (!res || res.error || !res.data) return;
        var row = Array.isArray(res.data) ? res.data[0] : res.data;
        var id = String((row && (row.out_company_id || row.company_id)) || '').trim();
        var name = String((row && (row.out_company_name || row.company_name || row.name)) || '').trim();
        try {
          if (id && window.currentUserProfile) {
            window.currentUserProfile.companyId = id;
            if (name) window.currentUserProfile.companyName = name;
          }
        } catch (_) {}
        paintCompanyLine();
      })
      .catch(function () {});
  }

  function payNow() {
    var email = ownerEmail();
    if (!canManage() && !email) {
      setMessage('Sign in first, then pay on PayFast.', true);
      return;
    }
    var pf = payfast();
    if (!pf || !pf.startCheckout) {
      setMessage('PayFast is not ready on this page.', true);
      return;
    }
    var interval = selectedBillingInterval();
    if (!email) {
      setMessage('Sign in first, then pay on PayFast.', true);
      return;
    }
    paintCompanyLine();
    setMessage('Opening PayFast…');
    preparePayCompany()
      .then(function () {
        return pf.startCheckout({
          kind: 'subscribe',
          company: companyName() || 'Fire-S',
          email: email,
          interval: interval
        });
      })
      .then(function (res) {
        if (res && res.ok === false) {
          var err = String((res && res.error) || '');
          if (
            !linkedCompanyId() &&
            (/create your company first/i.test(err) || /no company/i.test(err))
          ) {
            paintCompanyLine();
            setMessage(noCompanyPayMessage(), true);
            return;
          }
          setMessage(err || 'PayFast did not open. Try Pay on PayFast again.', true);
          return;
        }
        if (!(res && res.ok)) {
          setMessage('PayFast did not open. Try Pay on PayFast again.', true);
        }
      })
      .catch(function (err) {
        setMessage((err && err.message) || 'PayFast is not ready on the server.', true);
      });
  }

  function homeRole() {
    try {
      if (typeof window.resolveFireSHomeRole === 'function') {
        return String(window.resolveFireSHomeRole() || '').toLowerCase();
      }
    } catch (_) {}
    try {
      return String((window.currentUserProfile && window.currentUserProfile.role) || '').toLowerCase();
    } catch (_) {}
    return '';
  }

  function canManage() {
    var profileRole = '';
    try {
      profileRole = String((window.currentUserProfile && window.currentUserProfile.role) || '').toLowerCase();
    } catch (_) {}
    if (
      profileRole === 'company_owner' ||
      profileRole === 'owner' ||
      profileRole === 'super_admin' ||
      profileRole === 'admin'
    ) {
      return true;
    }
    var role = homeRole();
    if (role === 'company_owner' || role === 'owner' || role === 'super_admin') return true;
    // Staging paints new_company while companyId is still loading. A signed-in
    // cancelled owner must still be able to open PayFast.
    if (role === 'new_company' && ownerEmail()) return true;
    return false;
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
    el.style.display = 'block';
    el.hidden = false;
    el.textContent = msg;
    el.className = 'fire-s-subscribe-message' + (isError ? ' is-error' : '');
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (_) {}
    if (isError) {
      try {
        window.alert(msg);
      } catch (_) {}
    }
  }

  function selectedInterval() {
    var cat = catalog();
    var billing = byId('fireSSubscribeBillingOptions');
    if (cat && cat.selectedIntervalFrom && billing) {
      return cat.selectedIntervalFrom(billing);
    }
    return cat && cat.currentIntervalId ? cat.currentIntervalId() : 'monthly';
  }

  function escapeSubscribeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function summaryOverlay() {
    var overlay = {};
    try {
      var entitlement =
        window.fireSEntitlement &&
        window.fireSEntitlement.snapshot &&
        window.fireSEntitlement.snapshot();
      if (entitlement && entitlement.backendReady) {
        if (entitlement.status) overlay.status = entitlement.status;
        if (entitlement.billing_interval) overlay.interval = entitlement.billing_interval;
        if (entitlement.subscription_paid_through) {
          overlay.renewsOn = entitlement.subscription_paid_through;
        } else if (entitlement.subscription_expires_at) {
          overlay.renewsOn = entitlement.subscription_expires_at;
        }
      }
    } catch (_) {}
    try {
      var access = window.currentCompanyAccess || {};
      if (access.billingInterval) overlay.interval = access.billingInterval;
      if (access.billingRenewsOn) overlay.renewsOn = overlay.renewsOn || access.billingRenewsOn;
      if (!overlay.status && access.billingStatus) overlay.status = access.billingStatus;
    } catch (_) {}
    return overlay;
  }

  var billingHydrateBusy = false;
  function hydrateCompanyBilling() {
    if (billingHydrateBusy) return;
    var sb = window.supabaseClient;
    var cid = '';
    try {
      cid = String(
        (window.currentUserProfile && window.currentUserProfile.companyId) ||
          (window.currentCompanyAccess && window.currentCompanyAccess.companyId) ||
          ''
      ).trim();
    } catch (_) {}
    if (!sb || !sb.from || !cid) return;
    billingHydrateBusy = true;
    Promise.resolve(
      sb
        .from('companies')
        .select(
          'billing_interval, billing_renews_on, subscription_paid_through, subscription_expires_at'
        )
        .eq('id', cid)
        .maybeSingle()
    )
      .then(function (res) {
        billingHydrateBusy = false;
        if (!res || res.error || !res.data) return;
        var row = res.data;
        var interval = String(row.billing_interval || '').trim();
        var renews =
          row.billing_renews_on || row.subscription_paid_through || row.subscription_expires_at || '';
        var cat = catalog();
        try {
          if (!window.currentCompanyAccess) window.currentCompanyAccess = {};
          if (interval) window.currentCompanyAccess.billingInterval = interval;
          if (renews) window.currentCompanyAccess.billingRenewsOn = renews;
        } catch (_) {}
        if (cat && interval && cat.rememberInterval) cat.rememberInterval(interval);
        if (cat && renews && cat.rememberRenewsOn) cat.rememberRenewsOn(renews);
        paintCurrent();
      })
      .catch(function () {
        billingHydrateBusy = false;
      });
  }

  function paintCurrent() {
    var cat = catalog();
    var current = byId('fireSSubscribeCurrent');
    if (current) {
      var shown =
        cat && cat.currentSubscriptionSummary
          ? cat.currentSubscriptionSummary(summaryOverlay())
          : {
              heading: 'Current subscription',
              title: 'None yet',
              detail: 'Not paid yet. Choose Monthly or Annual below.'
            };
      current.innerHTML =
        '<span class="fire-s-subscribe-current-kicker">' +
        escapeSubscribeText(shown.heading) +
        '</span><strong class="is-picked">' +
        escapeSubscribeText(shown.title) +
        '</strong><span>' +
        escapeSubscribeText(shown.detail) +
        '</span>';
    }
    paintCompanyLine();
    paintSubscribeStatus();
    loadCompanyBilling();
  }

  function formatBillingDate(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '—';
    return text.slice(0, 10);
  }

  function paintCompanyBilling(info) {
    var data = info || {};
    function setText(id, value) {
      var el = byId(id);
      if (el) el.textContent = value || '—';
    }
    setText('fireSBillingPlan', data.plan || 'standard');
    setText('fireSBillingInterval', data.billing_interval || '—');
    setText('fireSBillingStatus', data.subscription_status || data.status || '—');
    setText('fireSBillingTrial', formatBillingDate(data.trial_ends_at));
    setText('fireSBillingPaidThrough', formatBillingDate(data.paid_through));
    setText(
      'fireSBillingNext',
      String(data.subscription_status || '') === 'cancelled'
        ? 'Stopped'
        : formatBillingDate(data.next_billing_at)
    );
    setText('fireSBillingLastPaid', formatBillingDate(data.last_successful_payment_at));
    var grace = byId('fireSBillingGrace');
    if (grace) {
      if (data.in_grace) {
        grace.hidden = false;
        grace.textContent =
          'Grace period until ' +
          formatBillingDate(data.grace_ends_at || data.access_until) +
          '. Access stays. Data stays.';
      } else {
        grace.hidden = true;
        grace.textContent = '';
      }
    }
    var cancelBtn = byId('fireSBillingCancelBtn');
    var cancelled = String(data.subscription_status || '') === 'cancelled';
    try {
      var entitlement =
        window.fireSEntitlement &&
        window.fireSEntitlement.snapshot &&
        window.fireSEntitlement.snapshot();
      if (entitlement && entitlement.backendReady && entitlement.status === 'subscription_cancelled') {
        cancelled = true;
      }
    } catch (_) {}
    try {
      if (catalog() && catalog().billingStatus && catalog().billingStatus() === 'cancelled') {
        cancelled = true;
      }
    } catch (_) {}
    if (cancelBtn) {
      var allowCancel = data.can_cancel == null ? canManage() : !!data.can_cancel;
      cancelBtn.hidden = !allowCancel || cancelled;
    }
    var billingActions = byId('fireSCompanyBillingActions');
    if (billingActions) billingActions.hidden = cancelled || mode === 'seat';
  }

  function billingFromEntitlement() {
    try {
      var entitlement =
        window.fireSEntitlement &&
        window.fireSEntitlement.snapshot &&
        window.fireSEntitlement.snapshot();
      if (!entitlement || !entitlement.backendReady) return null;
      var status = String(entitlement.subscription_status || entitlement.status || '').toLowerCase();
      if (status === 'subscription_cancelled') status = 'cancelled';
      if (status === 'subscription_past_due') status = 'past_due';
      if (status === 'subscription_active') status = 'active';
      return {
        plan: entitlement.plan || 'standard',
        billing_interval: entitlement.billing_interval || '',
        subscription_status: status,
        status: entitlement.status,
        trial_ends_at: entitlement.trial_ends_at || entitlement.trial_expires_at,
        paid_through: entitlement.subscription_paid_through,
        next_billing_at: entitlement.next_billing_at,
        last_successful_payment_at: entitlement.last_successful_payment_at,
        in_grace: !!entitlement.in_grace,
        grace_ends_at: entitlement.grace_ends_at,
        access_until: entitlement.access_until,
        can_subscribe: true,
        keep_data: true
      };
    } catch (_) {
      return null;
    }
  }

  function loadCompanyBilling() {
    var fallback = billingFromEntitlement();
    if (fallback) paintCompanyBilling(fallback);
    var sb = window.supabaseClient;
    if (!sb || !sb.rpc) return;
    var cid = linkedCompanyId();
    var args = cid ? { p_company_id: cid } : {};
    Promise.resolve(sb.rpc('fire_s_get_company_billing', args))
      .then(function (res) {
        if (!res || res.error || !res.data) {
          if (fallback) paintCompanyBilling(fallback);
          return;
        }
        var data = res.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (_) {}
        }
        paintCompanyBilling(data);
      })
      .catch(function () {
        if (fallback) paintCompanyBilling(fallback);
      });
  }

  function billingSubscribe() {
    if (payfastOn()) {
      payNow();
      return;
    }
    setMessage('PayFast is not ready on this page.', true);
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
    var entitlement = null;
    try {
      entitlement = window.fireSEntitlement && window.fireSEntitlement.snapshot && window.fireSEntitlement.snapshot();
    } catch (_) {}
    var status = 'unpaid';
    if (entitlement && entitlement.backendReady) {
      if (entitlement.status === 'subscription_active') status = 'active';
      else if (entitlement.status === 'subscription_cancelled') status = 'cancelled';
      else if (entitlement.status === 'subscription_past_due') status = 'past_due';
      else if (entitlement.status === 'trial_active') status = 'trial';
      else if (entitlement.reason === 'trial_limit_reached') status = 'trial';
      else if (entitlement.reason === 'trial_expired') status = 'unpaid';
    } else {
      status = 'unpaid';
    }
    var cancelled = status === 'cancelled';
    if (!cancelled) {
      try {
        if (cat.billingStatus && cat.billingStatus() === 'cancelled') cancelled = true;
      } catch (_) {}
    }
    box.hidden = false;
    box.className = 'fire-s-subscribe-status is-' + status;
    if (title) {
      title.textContent =
        status === 'active'
          ? 'Active subscription'
          : cancelled
            ? 'Cancelled'
            : status === 'past_due'
              ? 'Payment past due'
            : status === 'trial'
              ? 'Free trial'
            : 'Not paid yet';
    }
    if (copy) {
      if (entitlement && entitlement.backendReady && window.fireSEntitlement && window.fireSEntitlement.displayCopy) {
        var shown = window.fireSEntitlement.displayCopy(entitlement);
        copy.textContent = shown.detail || shown.headline || cat.statusHeadline();
      } else {
        copy.textContent = cat.statusHeadline();
      }
    }
    if (keep) keep.textContent = cat.statusKeepDataNote();
    if (cancelPanel) cancelPanel.hidden = !canManage() || cancelled;
    if (againPanel) againPanel.hidden = true;
    if (cancelBtn) {
      cancelBtn.disabled = cancelled;
      cancelBtn.textContent = cancelled ? 'Already cancelled' : 'Cancel subscription';
    }
    if (save && mode !== 'seat') {
      save.style.display = cancelled ? 'none' : '';
      save.hidden = cancelled;
    }
    var billingActions = byId('fireSCompanyBillingActions');
    if (billingActions) {
      billingActions.hidden = cancelled || mode === 'seat';
    }
    var required = byId('fireSSubscriptionRequiredPanel');
    if (required) required.hidden = true;
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
    try {
      var sb = window.supabaseClient;
      if (sb && sb.rpc) {
        sb.rpc('fire_s_cancel_company_subscription').then(function (res) {
          if (res && res.error) console.warn('Cancel subscription RPC', res.error);
          try {
            if (window.fireSEntitlement && window.fireSEntitlement.refresh) {
              window.fireSEntitlement.refresh(true);
            }
          } catch (_) {}
        });
      }
    } catch (_) {}
    setMessage('Cancelled. Auto-renew is off. Company name and inspections stay saved. Login with this same email to subscribe again.');
    paintSubscribeStatus();
    paintPayfastControls();
    refreshCardCopy();
    paintExpiryReminder();
  }

  async function subscribeAgain() {
    payNow();
  }

  function hideOtherSections() {
    [
      'homeSection',
      'fireSHomeLockPanel',
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
      if (!el) return;
      el.hidden = true;
      if (el.style && typeof el.style.setProperty === 'function') {
        el.style.setProperty('display', 'none', 'important');
      } else if (el.style) {
        el.style.display = 'none';
      }
    });
  }

  function hideEl(el) {
    if (!el) return;
    el.hidden = true;
    try {
      el.setAttribute('aria-hidden', 'true');
    } catch (_) {}
    if (el.style && typeof el.style.setProperty === 'function') {
      el.style.setProperty('display', 'none', 'important');
    } else if (el.style) {
      el.style.display = 'none';
    }
  }

  function showEl(el, display) {
    if (!el) return;
    el.hidden = false;
    try {
      el.removeAttribute('hidden');
    } catch (_) {}
    try {
      el.removeAttribute('aria-hidden');
    } catch (_) {}
    if (el.style && typeof el.style.setProperty === 'function') {
      el.style.setProperty('display', display || 'block', 'important');
    } else if (el.style) {
      el.style.display = display || 'block';
    }
  }

  function goHome() {
    hideEl(byId('fireSSubscribeSection'));
    if (mode === 'seat') {
      try {
        if (typeof window.fireSOpenCompanyTeam === 'function') {
          window.fireSOpenCompanyTeam({ keepAfterCreate: true });
          return;
        }
      } catch (_) {}
    }
    showEl(byId('homeSection'), 'block');
    try {
      if (typeof window.showHome === 'function') window.showHome();
    } catch (_) {}
    showEl(byId('homeSection'), 'block');
    try {
      if (
        window.fireSEntitlement &&
        typeof window.fireSEntitlement.inspectionAccessLocked === 'function' &&
        window.fireSEntitlement.inspectionAccessLocked() &&
        typeof window.fireSEntitlement.pinLockedHome === 'function'
      ) {
        window.fireSEntitlement.pinLockedHome({ preferHome: true });
      }
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
      // Company members may VIEW plans. Only the Owner can change billing.
    }
    hideOtherSections();
    var section = byId('fireSSubscribeSection');
    if (section) {
      section.hidden = false;
      try {
        section.removeAttribute('aria-hidden');
      } catch (_) {}
      if (section.style && typeof section.style.setProperty === 'function') {
        section.style.setProperty('display', 'block', 'important');
      } else if (section.style) {
        section.style.display = 'block';
      }
    }
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
    hydrateCompanyBilling();
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
        var seatPay = await payfast().startCheckout({
          kind: 'seat',
          company: companyName() || 'Fire-S',
          email: ownerEmail(),
          seatEmail: email,
          interval: intervalId
        });
        if (seatPay && seatPay.ok === false) {
          setMessage(seatPay.error || 'PayFast is not ready on the server.', true);
          return;
        }
        return;
      }
    } catch (err) {
      setMessage((err && err.message) || 'Could not subscribe that email.', true);
    } finally {
      if (seatBtn) seatBtn.disabled = false;
    }
  }

  async function savePlan() {
    if (!canManage()) {
      setMessage('Only the Owner can change billing.', true);
      return;
    }
    var cat = catalog();
    var billing = byId('fireSSubscribeBillingOptions');
    if (!cat || !cat.persistCompanyPlan) {
      setMessage('Subscription list is not ready. Wait a moment and try again.', true);
      return;
    }
    var intervalId = cat.selectedIntervalFrom ? cat.selectedIntervalFrom(billing) : 'monthly';
    setMessage('Saving billing…');
    var result = await cat.persistCompanyPlan('standard', intervalId, { markPaid: false });
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
    var billingSub = byId('fireSBillingSubscribeBtn');
    var billingCancel = byId('fireSBillingCancelBtn');
    if (back) back.addEventListener('click', goHome);
    if (save) save.addEventListener('click', savePlan);
    if (payBtn) payBtn.addEventListener('click', payNow);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelSubscription);
    if (againBtn) againBtn.addEventListener('click', subscribeAgain);
    if (billingSub) billingSub.addEventListener('click', billingSubscribe);
    if (billingCancel) billingCancel.addEventListener('click', cancelSubscription);
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
    paintCurrent();
    hydrateCompanyBilling();
  }

  window.fireSOpenSubscribe = openSubscribe;
  window.fireSOpenSubscribePerson = openSubscribePerson;
  window.fireSStartSubscribeCheckout = payNow;
  window.fireSSubscribeGoBack = goHome;
  window.fireSSetSubscribeMessage = setMessage;
  window.fireSRefreshSubscribeCard = refreshCardCopy;
  window.fireSPaintExpiryReminder = paintExpiryReminder;
  window.fireSPaintSubscribeStatus = paintSubscribeStatus;
  window.fireSPaintSubscribeCurrent = paintCurrent;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('fire-s:auth-changed', function () {
    refreshCardCopy();
    paintExpiryReminder();
    paintCurrent();
    hydrateCompanyBilling();
  });
})();
