/* ============================================================
   Fire-S company entitlement (client display + UX gates)

   Authority lives in Supabase:
     fire_s_check_company_entitlement()
     inspection INSERT/UPDATE trigger
     companies entitlement-column trigger

   This module may DISPLAY trial/subscription state.
   It must not GRANT access from localStorage, URL, or JS variables.
   ============================================================ */
(function fireSEntitlement(root) {
  'use strict';

  // Display fallback only. Enforcement is public.fire_s_entitlement_config.
  var CONFIG = {
    DEFAULT_TRIAL_DAYS: 14,
    DEFAULT_TRIAL_INSPECTION_LIMIT: 3
  };

  var last = null;
  var lastAt = 0;
  var refreshInFlight = null;
  var ALLOWED_WHEN_LOCKED = {
    fireSSubscribeSection: true,
    fireSGetStarted: true,
    companyLetterheadSection: true,
    userManualSection: true
  };

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function getSb() {
    try {
      if (root.supabaseClient) return root.supabaseClient;
    } catch (_) {}
    return null;
  }

  function companyId() {
    try {
      return text(root.currentUserProfile && root.currentUserProfile.companyId);
    } catch (_) {}
    return '';
  }

  function isSuperAdmin() {
    try {
      if (typeof root.isSuperAdmin === 'function') return !!root.isSuperAdmin();
    } catch (_) {}
    try {
      return text(root.currentUserProfile && root.currentUserProfile.role).toLowerCase() === 'super_admin';
    } catch (_) {}
    return false;
  }

  function isLocalWorkspace() {
    try {
      var id = text(root.currentUserProfile && root.currentUserProfile.id);
      if (!id || id === 'local-user') return true;
      var email = text(root.currentUserProfile && root.currentUserProfile.email).toLowerCase();
      if (!email || email === 'local@fire-s.app') return true;
    } catch (_) {}
    return false;
  }

  function emptySnapshot(reason) {
    return {
      allowed: false,
      reason: reason || 'subscription_required',
      status: reason || 'subscription_required',
      trial_days_remaining: 0,
      trial_inspections_remaining: 0,
      trial_inspections_used: 0,
      trial_inspection_limit: CONFIG.DEFAULT_TRIAL_INSPECTION_LIMIT,
      plan: null,
      can_finalise: false,
      can_create: false,
      can_write_draft: true,
      backendReady: false,
      source: 'none'
    };
  }

  function snapshot() {
    return last;
  }

  function hasSnapshot() {
    return !!(last && last.backendReady);
  }

  function operationallyAllowed() {
    if (isSuperAdmin()) return true;
    if (!hasSnapshot()) return null;
    return last.allowed === true;
  }

  function canFinalise() {
    if (isSuperAdmin()) return true;
    if (!hasSnapshot()) return null;
    return last.can_finalise === true;
  }

  function canCreate() {
    if (isSuperAdmin()) return true;
    if (!hasSnapshot()) return null;
    return last.can_create === true;
  }

  function parseRpcError(err) {
    var msg = text(err && (err.message || err.error_description || err));
    var match = msg.match(/FIRE_S_ENTITLEMENT:([a-z_]+):?(.*)$/i);
    if (!match) {
      return { reason: '', message: msg, entitlement: /FIRE_S_ENTITLEMENT/i.test(msg) };
    }
    return {
      reason: String(match[1] || '').toLowerCase(),
      message: text(match[2]) || humanMessage(String(match[1] || '').toLowerCase()),
      entitlement: true
    };
  }

  function humanMessage(reason, info) {
    var days = info && Number(info.trial_days_remaining);
    if (reason === 'trial_limit_reached') {
      return 'You have completed the inspections included in your Fire-S free trial. Choose a subscription plan to continue using Fire-S.';
    }
    if (reason === 'trial_expired') {
      return 'Your Fire-S free trial has ended.';
    }
    if (reason === 'subscription_required') {
      return 'A Fire-S subscription is required to continue.';
    }
    if (info && info.status === 'trial_active' && days <= 3 && days > 1) {
      return 'Your Fire-S trial ends in ' + days + ' days.';
    }
    if (info && info.status === 'trial_active' && days === 1) {
      return 'Your Fire-S trial ends tomorrow.';
    }
    return 'Choose a subscription plan to continue using Fire-S.';
  }

  function displayCopy(info) {
    var data = info || last || emptySnapshot();
    var days = Math.max(0, Number(data.trial_days_remaining) || 0);
    var remaining = Math.max(0, Number(data.trial_inspections_remaining) || 0);
    var used = Math.max(0, Number(data.trial_inspections_used) || 0);
    var limit = Math.max(0, Number(data.trial_inspection_limit) || CONFIG.DEFAULT_TRIAL_INSPECTION_LIMIT);
    var status = text(data.status);
    var reason = text(data.reason);
    var headline = '';
    var detail = '';
    var urgency = 'none';
    var cta = 'VIEW PLANS / SUBSCRIBE';

    if (status === 'subscription_active' || data.allowed === true && status !== 'trial_active') {
      if (status === 'subscription_active') {
        return { headline: 'Subscription active', detail: '', urgency: 'none', cta: cta, show: false };
      }
    }

    if (reason === 'trial_limit_reached') {
      headline = 'Trial inspections used';
      detail = 'You have completed the inspections included in your Fire-S trial.';
      urgency = 'block';
      return { headline: headline, detail: detail, urgency: urgency, cta: cta, show: true, days: days, remaining: remaining, used: used, limit: limit };
    }
    if (reason === 'trial_expired' || status === 'trial_expired') {
      headline = 'Trial ended';
      detail = 'Your Fire-S free trial has ended.';
      urgency = 'block';
      return { headline: headline, detail: detail, urgency: urgency, cta: cta, show: true, days: 0, remaining: remaining, used: used, limit: limit };
    }
    if (status === 'trial_active') {
      headline = 'Trial — ' + days + ' day' + (days === 1 ? '' : 's') + ' remaining';
      detail = remaining + ' trial inspection' + (remaining === 1 ? '' : 's') + ' remaining';
      if (days <= 1) {
        urgency = 'high';
        detail = (days === 1 ? 'Your Fire-S trial ends tomorrow.' : 'Your Fire-S trial ends today.') + ' ' + detail;
      } else if (days <= 3) {
        urgency = 'mid';
        detail = 'Your Fire-S trial ends in ' + days + ' days. ' + detail;
      }
      return { headline: headline, detail: detail, urgency: urgency, cta: cta, show: true, days: days, remaining: remaining, used: used, limit: limit };
    }
    if (status === 'subscription_cancelled' || status === 'subscription_past_due' || status === 'subscription_suspended' || reason === 'subscription_required') {
      headline = 'Subscription required';
      detail = humanMessage(reason || 'subscription_required', data);
      urgency = 'block';
      return { headline: headline, detail: detail, urgency: urgency, cta: cta, show: true, days: days, remaining: remaining, used: used, limit: limit };
    }
    return { headline: '', detail: '', urgency: 'none', cta: cta, show: false, days: days, remaining: remaining, used: used, limit: limit };
  }

  function blockMessage() {
    var copy = displayCopy(last);
    if (last && last.reason === 'trial_limit_reached') {
      return 'You have completed the inspections included in your Fire-S free trial. Choose a subscription plan to continue using Fire-S.';
    }
    return copy.detail || humanMessage(last && last.reason, last);
  }

  async function check(targetCompanyId) {
    var sb = getSb();
    var cid = text(targetCompanyId) || companyId();
    if (!sb || !sb.rpc || !cid || isLocalWorkspace()) {
      last = emptySnapshot('subscription_required');
      last.backendReady = false;
      last.source = 'local';
      return last;
    }
    try {
      var res = await sb.rpc('fire_s_check_company_entitlement', { p_company_id: cid });
      if (res && res.error) {
        var missing = /could not find the function|schema cache|PGRST202|404/i.test(text(res.error.message));
        last = emptySnapshot('subscription_required');
        last.backendReady = false;
        last.source = missing ? 'missing-rpc' : 'rpc-error';
        last.error = text(res.error.message);
        return last;
      }
      var data = res && res.data;
      if (Array.isArray(data)) data = data[0];
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (_) {}
      }
      last = Object.assign({ backendReady: true, source: 'rpc' }, data || {});
      lastAt = Date.now();
      paint();
      return last;
    } catch (err) {
      last = emptySnapshot('subscription_required');
      last.backendReady = false;
      last.source = 'rpc-error';
      last.error = text(err && err.message);
      return last;
    }
  }

  function refresh(force) {
    if (refreshInFlight && !force) return refreshInFlight;
    refreshInFlight = check().finally(function () {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  function openPlans() {
    try {
      if (typeof root.fireSOpenSubscribe === 'function') {
        root.fireSOpenSubscribe();
        return;
      }
    } catch (_) {}
    try {
      var btn = document.getElementById('cmdSubscribeBtn');
      if (btn) btn.click();
    } catch (_) {}
  }

  function ensureBanner() {
    var host = document.getElementById('mainCommandCentre');
    if (!host) return null;
    var el = document.getElementById('fireSTrialBanner');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'fireSTrialBanner';
    el.className = 'fire-s-trial-banner';
    el.hidden = true;
    el.innerHTML =
      '<div class="fire-s-trial-banner-copy">' +
        '<strong id="fireSTrialBannerTitle"></strong>' +
        '<span id="fireSTrialBannerDetail"></span>' +
      '</div>' +
      '<button type="button" class="cloud-primary-btn fire-s-trial-banner-cta" id="fireSTrialBannerCta">VIEW PLANS / SUBSCRIBE</button>';
    var status = document.getElementById('mainCommandAccessStatus');
    if (status && status.parentNode === host.querySelector('.main-command-top')) {
      host.querySelector('.main-command-top').after(el);
    } else {
      host.insertBefore(el, host.firstChild.nextSibling);
    }
    var cta = document.getElementById('fireSTrialBannerCta');
    if (cta && !cta.__fireSBound) {
      cta.__fireSBound = true;
      cta.addEventListener('click', function (ev) {
        ev.preventDefault();
        openPlans();
      });
    }
    return el;
  }

  function ensureBlocker() {
    var el = document.getElementById('fireSEntitlementBlocker');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'fireSEntitlementBlocker';
    el.className = 'fire-s-entitlement-blocker';
    el.hidden = true;
    el.innerHTML =
      '<div class="fire-s-entitlement-blocker-card">' +
        '<h3 id="fireSEntitlementBlockerTitle">Subscription required</h3>' +
        '<p id="fireSEntitlementBlockerCopy"></p>' +
        '<div class="fire-s-entitlement-blocker-actions">' +
          '<button type="button" class="cloud-primary-btn" id="fireSEntitlementBlockerSubscribe">VIEW PLANS / SUBSCRIBE</button>' +
          '<button type="button" class="secondary-btn" id="fireSEntitlementBlockerHome">Back Home</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    var sub = document.getElementById('fireSEntitlementBlockerSubscribe');
    var home = document.getElementById('fireSEntitlementBlockerHome');
    if (sub) {
      sub.addEventListener('click', function () {
        el.hidden = true;
        openPlans();
      });
    }
    if (home) {
      home.addEventListener('click', function () {
        el.hidden = true;
        try {
          if (typeof root.showHome === 'function') root.showHome();
        } catch (_) {}
      });
    }
    return el;
  }

  function visibleWorkspaceId() {
    var ids = [
      'fireSSubscribeSection',
      'companyLetterheadSection',
      'userManualSection',
      'projectFormSection',
      'projectListSection',
      'companyTeamSection',
      'managementDashboardSection',
      'testSamplesSection',
      'inspectorBoardSection',
      'servicesSection',
      'findingsCentreSection',
      'reportSection',
      'homeSection'
    ];
    for (var i = 0; i < ids.length; i += 1) {
      var node = document.getElementById(ids[i]);
      if (!node) continue;
      if (node.hidden) continue;
      if (node.style && node.style.display === 'none') continue;
      return ids[i];
    }
    return 'homeSection';
  }

  function showBlockerIfNeeded() {
    var copy = displayCopy(last);
    var blocker = ensureBlocker();
    if (!blocker) return;
    var space = visibleWorkspaceId();
    var lockedOp = copy.urgency === 'block' && !ALLOWED_WHEN_LOCKED[space] && space !== 'homeSection';
    if (!lockedOp) {
      blocker.hidden = true;
      return;
    }
    var title = document.getElementById('fireSEntitlementBlockerTitle');
    var body = document.getElementById('fireSEntitlementBlockerCopy');
    if (title) title.textContent = copy.headline || 'Subscription required';
    if (body) body.textContent = blockMessage();
    blocker.hidden = false;
  }

  function paint() {
    var banner = ensureBanner();
    if (!banner) return;
    var copy = displayCopy(last);
    var title = document.getElementById('fireSTrialBannerTitle');
    var detail = document.getElementById('fireSTrialBannerDetail');
    var cta = document.getElementById('fireSTrialBannerCta');
    if (!copy.show || isSuperAdmin()) {
      banner.hidden = true;
      banner.className = 'fire-s-trial-banner';
    } else {
      banner.hidden = false;
      banner.className = 'fire-s-trial-banner is-' + copy.urgency;
      if (title) title.textContent = copy.headline;
      if (detail) detail.textContent = copy.detail;
      if (cta) cta.textContent = copy.cta;
    }
    try {
      var fullyBlocked =
        copy.urgency === 'block' &&
        !isSuperAdmin() &&
        last &&
        last.can_create === false;
      document.body.classList.toggle('fire-s-entitlement-blocked', fullyBlocked);
    } catch (_) {}
    showBlockerIfNeeded();
    paintSubscribeHints(copy);
  }

  function paintSubscribeHints(copy) {
    var box = document.getElementById('fireSTrialSubscribeNote');
    if (!box) return;
    if (!copy || !copy.show) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent = copy.detail || copy.headline;
  }

  function deny(reason) {
    var parsed = typeof reason === 'string' ? { reason: reason } : parseRpcError(reason);
    var message = parsed.message || humanMessage(parsed.reason, last);
    try {
      alert(message);
    } catch (_) {}
    if (parsed.reason === 'trial_limit_reached' || parsed.reason === 'trial_expired' || parsed.reason === 'subscription_required') {
      openPlans();
    }
    return false;
  }

  async function assertCanFinalise() {
    if (isSuperAdmin()) return true;
    var info = await refresh();
    if (!info || !info.backendReady) return true;
    if (info.can_finalise === true) return true;
    return deny(info.reason || 'subscription_required');
  }

  async function assertCanCreate() {
    if (isSuperAdmin()) return true;
    var info = await refresh();
    if (!info || !info.backendReady) return true;
    if (info.can_create === true || info.allowed === true) return true;
    return deny(info.reason || 'subscription_required');
  }

  function wrapFinish() {
    var original = root.finishInspection;
    if (typeof original !== 'function' || original.__fireSEntitlementFinish) return;
    var wrapped = function fireSEntitlementFinish() {
      var args = arguments;
      return Promise.resolve(assertCanFinalise()).then(function (ok) {
        if (ok === false) return;
        return original.apply(root, args);
      });
    };
    wrapped.__fireSEntitlementFinish = true;
    root.finishInspection = wrapped;
    try {
      root.eval('finishInspection = window.finishInspection');
    } catch (_) {}
  }

  function wrapNewInspection() {
    var names = ['createNewInspection', 'startNewInspection', 'addNewProject'];
    names.forEach(function (name) {
      var original = root[name];
      if (typeof original !== 'function' || original.__fireSEntitlementCreate) return;
      var wrapped = function () {
        var args = arguments;
        var ctx = this;
        return Promise.resolve(assertCanCreate()).then(function (ok) {
          if (ok === false) return;
          return original.apply(ctx, args);
        });
      };
      wrapped.__fireSEntitlementCreate = true;
      root[name] = wrapped;
    });
  }

  async function extendTrial(targetCompanyId, extraDays) {
    var sb = getSb();
    if (!sb || !sb.rpc) return { ok: false, error: 'Cloud is not ready' };
    if (!isSuperAdmin()) return { ok: false, error: 'Only Super Admin can extend a trial' };
    var res = await sb.rpc('fire_s_admin_extend_trial', {
      p_company_id: targetCompanyId,
      p_extra_days: extraDays
    });
    if (res && res.error) return { ok: false, error: res.error.message || res.error };
    await refresh(true);
    return { ok: true, data: res.data };
  }

  async function analytics() {
    var sb = getSb();
    if (!sb || !sb.rpc) return null;
    var res = await sb.rpc('fire_s_admin_trial_analytics');
    if (res && res.error) return null;
    return res.data;
  }

  async function listCompanies() {
    var sb = getSb();
    if (!sb || !sb.rpc) return [];
    var res = await sb.rpc('fire_s_admin_list_entitlements');
    if (res && res.error) return [];
    return Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
  }

  function wire() {
    wrapFinish();
    wrapNewInspection();
    ensureBanner();
    ensureBlocker();
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t) return;
      if (t.id === 'newInspectionBtn' || t.id === 'cmdInspectionsBtn' || t.closest && t.closest('#newInspectionBtn')) {
        if (document.body.classList.contains('fire-s-entitlement-blocked')) {
          var creating = t.id === 'newInspectionBtn' || (t.closest && t.closest('#newInspectionBtn'));
          if (creating) {
            var info = last;
            if (info && info.backendReady && info.can_create === false) {
              ev.preventDefault();
              ev.stopPropagation();
              deny(info.reason);
            }
          }
        }
      }
    }, true);
    setTimeout(function () {
      refresh();
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  root.fireSEntitlement = {
    CONFIG: CONFIG,
    check: check,
    refresh: refresh,
    snapshot: snapshot,
    hasSnapshot: hasSnapshot,
    operationallyAllowed: operationallyAllowed,
    canFinalise: canFinalise,
    canCreate: canCreate,
    displayCopy: displayCopy,
    humanMessage: humanMessage,
    parseRpcError: parseRpcError,
    openPlans: openPlans,
    extendTrial: extendTrial,
    analytics: analytics,
    listCompanies: listCompanies,
    assertCanFinalise: assertCanFinalise,
    assertCanCreate: assertCanCreate,
    paint: paint,
    blockMessage: blockMessage
  };
  root.checkCompanyEntitlement = function (id) {
    return check(id);
  };
})(window);
