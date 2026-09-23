/* ============================================================
   Fire-S company entitlement (client display + UX gates)

   Authority lives in Supabase:
     fire_s_get_company_entitlement()
     inspection INSERT/UPDATE trigger (including new cycles)
     companies entitlement-column trigger

   This module may DISPLAY trial/subscription state.
   It must not GRANT access from localStorage, URL, JS variables, or the
   browser clock. Trial dates come from fire_s_get_company_entitlement.
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
    fireSSubscriptionRequiredSection: true,
    fireSCompanyBillingPanel: true,
    companyLetterheadSection: true,
    userManualSection: true,
    homeSection: true
  };

  var INSPECTION_WORKSPACES = [
    'projectFormSection',
    'projectListSection',
    'reportSection',
    'companyTeamSection',
    'inspectorBoardSection',
    'servicesSection',
    'findingsCentreSection',
    'testSamplesSection',
    'managementDashboardSection'
  ];

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
      trial_started_at: null,
      trial_ends_at: null,
      trial_expires_at: null,
      plan: null,
      can_finalise: false,
      can_create: false,
      can_write_draft: false,
      can_read: false,
      can_export: false,
      keep_data: true,
      authority: 'none',
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

  function isCancelledCompany() {
    var status = text(last && last.status);
    var reason = text(last && last.reason);
    return status === 'subscription_cancelled' ||
      reason === 'subscription_cancelled' ||
      reason === 'cancelled_until_period_end';
  }

  function operationallyAllowed() {
    if (isSuperAdmin()) return true;
    if (isLocalWorkspace()) return true;
    if (!hasSnapshot()) return false;
    if (isCancelledCompany()) return false;
    return last.allowed === true;
  }

  function canFinalise() {
    if (isSuperAdmin()) return true;
    if (isLocalWorkspace()) return true;
    if (!hasSnapshot()) return false;
    if (isCancelledCompany()) return false;
    return last.can_finalise === true;
  }

  function canCreate() {
    if (isSuperAdmin()) return true;
    if (isLocalWorkspace()) return true;
    if (!hasSnapshot()) return false;
    if (isCancelledCompany()) return false;
    return last.can_create === true;
  }

  function canRead() {
    if (isSuperAdmin()) return true;
    if (isLocalWorkspace()) return true;
    if (!hasSnapshot()) return false;
    if (isCancelledCompany()) return false;
    return last.can_read === true || last.allowed === true;
  }

  function canExport() {
    if (isSuperAdmin()) return true;
    if (isLocalWorkspace()) return true;
    if (!hasSnapshot()) return false;
    if (isCancelledCompany()) return false;
    return last.can_export === true || last.can_read === true || last.allowed === true;
  }

  function isCloudCompanyUser() {
    try {
      var id = text(root.currentUserProfile && root.currentUserProfile.id);
      if (!id || id === 'local-user') return false;
      var email = text(root.currentUserProfile && root.currentUserProfile.email).toLowerCase();
      if (!email || email === 'local@fire-s.app') return false;
      return true;
    } catch (_) {}
    return false;
  }

  function accessGateOpen() {
    try {
      var gate = document.getElementById('fireSGetStarted');
      if (!gate) return false;
      if (gate.hidden) return false;
      try {
        if (gate.getAttribute && gate.hasAttribute('hidden')) return false;
      } catch (_) {}
      if (gate.style && gate.style.display === 'none') return false;
      try {
        if (root.getComputedStyle) {
          var vis = String(root.getComputedStyle(gate).display || '');
          if (vis === 'none') return false;
        }
      } catch (_) {}
      return true;
    } catch (_) {}
    return false;
  }

  function memberRole() {
    try {
      return text(root.currentUserProfile && root.currentUserProfile.role).toLowerCase();
    } catch (_) {}
    return '';
  }

  function isPayingOwner() {
    if (isSuperAdmin()) return true;
    var role = memberRole();
    return role === 'company_owner' || role === 'owner' || role === 'admin';
  }

  var staffSignOutStarted = false;
  function staffMustSignOut() {
    if (isLocalWorkspace() || isSuperAdmin() || isPayingOwner()) return false;
    if (memberRole() === 'new_company' || !companyId()) return false;
    if (accessGateOpen()) return false;
    if (!hasSnapshot()) return false;
    if (last && last.staff_must_sign_out === true) return true;
    var status = text(last && last.status);
    var reason = text(last && last.reason);
    var dead =
      status === 'subscription_cancelled' ||
      status === 'subscription_required' ||
      status === 'trial_expired' ||
      reason === 'subscription_cancelled' ||
      reason === 'subscription_required' ||
      reason === 'trial_expired' ||
      (status === 'subscription_past_due' && last && last.allowed === false);
    return dead && inspectionAccessLocked();
  }

  function enforceStaffSignOut() {
    if (!staffMustSignOut()) {
      staffSignOutStarted = false;
      return false;
    }
    if (staffSignOutStarted) return true;
    staffSignOutStarted = true;
    try {
      root.alert(
        'This company subscription is cancelled. Ask the Owner to subscribe again on PayFast. You stay signed out until then. Inspections stay in the cloud.'
      );
    } catch (_) {}
    try {
      if (typeof root.logoutUser === 'function') {
        root.logoutUser();
        return true;
      }
    } catch (_) {}
    try {
      var sb = getSb();
      if (sb && sb.auth && typeof sb.auth.signOut === 'function') {
        sb.auth.signOut({ scope: 'local' });
      }
    } catch (_) {}
    return true;
  }

  function inspectionAccessLocked() {
    if (isSuperAdmin() || isLocalWorkspace()) return false;
    if (accessGateOpen()) return false;
    // Do not flash the red Home lock while the entitlement RPC is still
    // loading. Paid companies would see Cancelled / Subscription required
    // and then the real Home once the snapshot arrives.
    if (!hasSnapshot()) return false;
    var status = text(last && last.status);
    var reason = text(last && last.reason);
    if (isCancelledCompany()) return true;
    if (reason === 'past_due_grace' && last.allowed === true) return false;
    if (reason === 'trial_limit_reached') return false;
    if (status === 'trial_active' && last.allowed === true) return false;
    if (status === 'subscription_active' && last.allowed === true) return false;
    if (canRead() !== true) return true;
    if (last.allowed === false && (
      reason === 'subscription_required' ||
      reason === 'trial_expired' ||
      status === 'subscription_cancelled' ||
      status === 'trial_expired' ||
      status === 'subscription_required' ||
      status === 'subscription_past_due'
    )) {
      return true;
    }
    var copy = displayCopy(last);
    return !!(copy && copy.urgency === 'block' && reason !== 'trial_limit_reached');
  }

  function subscribeControlAction(node) {
    if (!node) return '';
    if (node.nodeType === 3) node = node.parentElement;
    if (!node || !node.closest) return '';
    try {
      if (node.closest('#fireSSubscribeBackBtn')) return 'home';
      if (
        node.closest('#fireSPayfastPayBtn') ||
        node.closest('#fireSBillingSubscribeBtn') ||
        node.closest('#fireSSubscribeAgainBtn')
      ) {
        return 'pay';
      }
    } catch (_) {}
    return '';
  }

  function runSubscribeControl(action) {
    if (action === 'home') {
      try {
        if (typeof root.fireSSubscribeGoBack === 'function') {
          root.fireSSubscribeGoBack();
          return true;
        }
      } catch (_) {}
      pinLockedHome({ preferHome: true });
      return true;
    }
    if (action === 'pay') {
      try {
        if (typeof root.fireSStartSubscribeCheckout === 'function') {
          root.fireSStartSubscribeCheckout();
          return true;
        }
      } catch (_) {}
      openPlans();
      return true;
    }
    return false;
  }

  function isAllowedLockedTarget(node) {
    if (!node) return false;
    if (node.nodeType === 3) node = node.parentElement;
    if (!node || !node.closest) return false;
    try {
      if (node.closest('#fireSSubscriptionRequiredBackBtn')) return false;
      if (node.closest('#projectsHomeBtn')) return false;
    } catch (_) {}
    if (subscribeControlAction(node)) return true;
    var allow = [
      '#fireSSubscribeSection',
      '#fireSSubscribeBackBtn',
      '#fireSSubscribePayActions',
      '#fireSPayfastPayBtn',
      '#fireSBillingSubscribeBtn',
      '#fireSSubscribeCompanyLine',
      '#fireSSubscribeMessage',
      '#fireSCompanyBillingPanel',
      '#fireSSubscriptionRequiredSection',
      '#fireSEntitlementBlocker',
      '#fireSTrialBanner',
      '#fireSHomeLockPanel',
      '#fireSHomeLockSubscribe',
      '#cmdSubscribeBtn',
      '#cmdUserManualBtn',
      '#cmdChangePasswordBtn',
      '#fireSChangePasswordSection',
      '#userManualSection',
      '#companyLetterheadSection',
      '#logoutBtn',
      '#homeLogoutBtn',
      '#fireSLoginViewPlansBtn'
    ];
    for (var i = 0; i < allow.length; i += 1) {
      try {
        if (node.closest(allow[i])) return true;
      } catch (_) {}
    }
    try {
      if (node.closest('a[href^="mailto:"]')) return true;
    } catch (_) {}
    return false;
  }

  function sendLockedActionToSubscribe() {
    return pinLockedHome();
  }

  function hideNode(node) {
    if (!node) return;
    node.hidden = true;
    try {
      node.setAttribute('aria-hidden', 'true');
    } catch (_) {}
    if (node.style) {
      if (typeof node.style.setProperty === 'function') {
        node.style.setProperty('display', 'none', 'important');
      } else {
        node.style.display = 'none';
      }
    }
  }

  function showNode(node, display) {
    if (!node) return;
    node.hidden = false;
    try {
      node.removeAttribute('aria-hidden');
    } catch (_) {}
    if (node.style) {
      if (typeof node.style.setProperty === 'function') {
        node.style.setProperty('display', display || 'block', 'important');
      } else {
        node.style.display = display || 'block';
      }
    }
  }

  function hideInspectionWorkspaces() {
    INSPECTION_WORKSPACES.forEach(function (id) {
      hideNode(document.getElementById(id));
    });
    ['openGateBackdrop', 'inspectionOpenGate', 'premisesCommandCentre', 'inspectorV4Root'].forEach(function (id) {
      hideNode(document.getElementById(id));
    });
  }

  var HOME_LOCK_HIDE_IDS = [
    'cmdInspectionsBtn',
    'cmdScheduleBtn',
    'cmdReportsBtn',
    'cmdCompanyDetailsBtn',
    'cmdCompanyBtn',
    'cmdTestSamplesBtn',
    'cmdManagementDashboardBtn',
    'cmdServicesBtn',
    'cmdDashboardBtn',
    'cmdFindingsBtn',
    'cmdOverdueBtn',
    'cmdInspectorsBtn',
    'cmdComplianceInspectionsBtn',
    'cmdComplianceFindingsBtn',
    'cmdComplianceOverdueBtn',
    'cmdComplianceSitesBtn',
    'fireSOwnerLists',
    'fireSOwnerKpiRow',
    'inspectorBoardHomeBar',
    'cmdPersonnelInspectors',
    'cmdPersonnelManagers',
    'cmdPersonnelOwners',
    'cmdPersonnelTotal'
  ];

  function hideHomeInspectionCards() {
    HOME_LOCK_HIDE_IDS.forEach(function (id) {
      hideNode(document.getElementById(id));
    });
    showNode(document.getElementById('cmdSubscribeBtn'), 'flex');
    showNode(document.getElementById('cmdUserManualBtn'), 'flex');
    showNode(document.getElementById('cmdChangePasswordBtn'), 'flex');
  }

  function ensureHomeLockPanel() {
    var home = document.getElementById('homeSection') || document.getElementById('mainCommandCentre');
    var el = document.getElementById('fireSHomeLockPanel');
    if (el && String(el.className || '').indexOf('fire-s-home-lock-panel') !== -1 && el.__fireSReady) {
      return el;
    }
    if (!el) {
      if (!home) return null;
      el = document.createElement('div');
      el.id = 'fireSHomeLockPanel';
    }
    el.className = 'fire-s-home-lock-panel';
    el.hidden = true;
    el.innerHTML =
      '<h3 id="fireSHomeLockTitle">Subscription required</h3>' +
      '<p id="fireSHomeLockStatus"></p>' +
      '<p id="fireSHomeLockCopy"></p>' +
      '<p>Inspections, reports, premises and photos stay in the cloud. Stay on Home until you subscribe. Nothing is deleted.</p>' +
      '<button type="button" class="cloud-primary-btn" id="fireSHomeLockSubscribe">Subscribe / Reactivate</button>';
    el.__fireSReady = true;
    if (home) {
      var hero = null;
      try {
        hero = home.querySelector('.home-hero');
      } catch (_) {}
      try {
        if (hero && hero.parentNode && typeof hero.after === 'function') hero.after(el);
        else if (typeof home.insertBefore === 'function') home.insertBefore(el, home.firstChild);
      } catch (_) {}
    }
    var btn = document.getElementById('fireSHomeLockSubscribe');
    if (btn && !btn.__fireSBound) {
      btn.__fireSBound = true;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        openPlans();
      });
    }
    return el;
  }

  function homeWorkAllowed() {
    if (accessGateOpen()) return false;
    if (isSuperAdmin()) return true;
    try {
      if (text(root.currentUserProfile && root.currentUserProfile.id) === 'local-user') return true;
    } catch (_) {}
    if (!hasSnapshot()) return true;
    return inspectionAccessLocked() === false;
  }

  function syncHomeLayer() {
    var allow = homeWorkAllowed();
    var locked = !allow;
    try {
      document.documentElement.classList.toggle('fire-s-entitlement-blocked', locked);
      document.documentElement.classList.toggle('fire-s-entitlement-allowed', allow);
      if (document.body) {
        document.body.classList.toggle('fire-s-entitlement-blocked', locked);
        document.body.classList.toggle('fire-s-entitlement-allowed', allow);
      }
    } catch (_) {}
    return allow;
  }

  function hideDesktopAccess() {
    hideNode(document.getElementById('fireSDesktopAccess'));
  }

  function subscribeSectionShown() {
    var section = document.getElementById('fireSSubscribeSection');
    if (!section) return false;
    if (section.hidden) return false;
    try {
      if (section.getAttribute && section.hasAttribute('hidden')) return false;
    } catch (_) {}
    var display = '';
    try {
      display = String((section.style && section.style.display) || '');
    } catch (_) {}
    if (display === 'none') return false;
    if (display === 'block' || display === 'flex' || display === 'grid') return true;
    return nodeIsShown(section);
  }

  function hideLockedHomeChrome() {
    hideNode(document.getElementById('homeSection'));
    hideNode(document.getElementById('fireSHomeLockPanel'));
    var personnel = null;
    try {
      personnel = document.querySelector('#homeSection .main-command-personnel, .main-command-personnel');
    } catch (_) {}
    hideNode(personnel);
  }

  function pinLockedHome(opts) {
    if (isSuperAdmin() || isLocalWorkspace()) return false;
    if (accessGateOpen()) {
      hideDesktopAccess();
      hideNode(document.getElementById('fireSHomeLockPanel'));
      syncHomeLayer();
      return false;
    }
    hideInspectionWorkspaces();
    hideHomeInspectionCards();
    hideDesktopAccess();
    syncHomeLayer();
    var preferHome = !!(opts && opts.preferHome);
    if (preferHome) {
      hideNode(document.getElementById('fireSSubscribeSection'));
    }
    if (subscribeSectionShown() && !preferHome) {
      hideLockedHomeChrome();
      try {
        document.body.classList.add('fire-s-entitlement-blocked');
        document.documentElement.classList.add('fire-s-entitlement-blocked');
      } catch (_) {}
      var openBlocker = ensureBlocker();
      if (openBlocker) hideNode(openBlocker);
      var required = document.getElementById('fireSSubscriptionRequiredPanel');
      if (required) required.hidden = true;
      return false;
    }
    var home = document.getElementById('homeSection');
    if (home) showNode(home, 'block');
    var panel = ensureHomeLockPanel();
    var copy = displayCopy(last);
    if (panel) {
      var title = document.getElementById('fireSHomeLockTitle');
      var status = document.getElementById('fireSHomeLockStatus');
      var body = document.getElementById('fireSHomeLockCopy');
      if (title) title.textContent = copy.headline || 'Subscription required';
      if (status) status.textContent = statusLabel(last);
      if (body) body.textContent = copy.detail || blockMessage();
      showNode(panel, 'grid');
    }
    try {
      document.body.classList.add('fire-s-entitlement-blocked');
      document.documentElement.classList.add('fire-s-entitlement-blocked');
    } catch (_) {}
    var blocker = ensureBlocker();
    if (blocker) hideNode(blocker);
    return false;
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
      return 'Your Fire-S free trial has ended. Subscribe on PayFast to continue.';
    }
    if (reason === 'past_due_grace') {
      return 'A payment did not go through. Fire-S stays available during the grace period. Subscribe on PayFast.';
    }
    if (reason === 'cancelled_until_period_end') {
      return 'This subscription is cancelled. Inspections stay in the cloud and stay locked until a new subscription is active.';
    }
    if (reason === 'subscription_cancelled') {
      return 'This subscription is cancelled. Inspections stay in the cloud and stay locked until a new subscription is active.';
    }
    if (reason === 'subscription_required') {
      return 'A Fire-S subscription is required to continue. Inspections stay in the cloud and stay locked until a new subscription is active.';
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
    var cta = 'Subscribe / Reactivate';

    if (status === 'subscription_active' || data.allowed === true && status !== 'trial_active') {
      if (status === 'subscription_active') {
        return { headline: 'Subscription active', detail: '', urgency: 'none', cta: cta, show: false };
      }
    }

    if (reason === 'trial_limit_reached') {
      headline = 'Trial inspections used';
      detail = 'You have completed the inspections included in your Fire-S trial. Subscribe on PayFast to continue.';
      urgency = 'block';
      return { headline: headline, detail: detail, urgency: urgency, cta: cta, show: true, days: days, remaining: remaining, used: used, limit: limit };
    }
    if (reason === 'trial_expired' || status === 'trial_expired') {
      headline = 'Trial ended';
      detail = 'Your Fire-S free trial has ended. Subscribe on PayFast to continue.';
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
    if (reason === 'past_due_grace' || (status === 'subscription_past_due' && data.allowed === true)) {
      headline = 'Payment past due';
      detail = humanMessage('past_due_grace', data);
      urgency = 'mid';
      return { headline: headline, detail: detail, urgency: urgency, cta: cta, show: true, days: days, remaining: remaining, used: used, limit: limit };
    }
    if (reason === 'cancelled_until_period_end' || status === 'subscription_cancelled') {
      headline = 'Subscription required';
      detail = humanMessage('subscription_cancelled', data);
      urgency = 'block';
      return { headline: headline, detail: detail, urgency: urgency, cta: 'Subscribe / Reactivate', show: true, days: days, remaining: remaining, used: used, limit: limit };
    }
    if (status === 'subscription_past_due' || status === 'subscription_suspended' || reason === 'subscription_required') {
      headline = 'Subscription required';
      detail = humanMessage(reason || 'subscription_required', data);
      urgency = 'block';
      return { headline: headline, detail: detail, urgency: urgency, cta: 'Subscribe / Reactivate', show: true, days: days, remaining: remaining, used: used, limit: limit };
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

  async function rpcEntitlement(sb, cid) {
    var names = ['fire_s_get_company_entitlement', 'fire_s_check_company_entitlement'];
    var lastErr = null;
    for (var i = 0; i < names.length; i += 1) {
      var res = await sb.rpc(names[i], { p_company_id: cid });
      if (res && !res.error) return res;
      lastErr = res && res.error;
      if (lastErr && !/could not find the function|schema cache|PGRST202|404/i.test(text(lastErr.message))) {
        return res;
      }
    }
    return { error: lastErr || { message: 'Entitlement RPC missing' } };
  }

  async function check(targetCompanyId) {
    var sb = getSb();
    var cid = text(targetCompanyId) || companyId();
    if (isLocalWorkspace()) {
      last = emptySnapshot('subscription_required');
      last.allowed = true;
      last.can_create = true;
      last.can_finalise = true;
      last.can_write_draft = true;
      last.can_read = true;
      last.can_export = true;
      last.backendReady = false;
      last.source = 'local';
      last.authority = 'local';
      return last;
    }
    if (!sb || !sb.rpc || !cid) {
      last = emptySnapshot('subscription_required');
      last.backendReady = false;
      last.source = 'none';
      return last;
    }
    try {
      var res = await rpcEntitlement(sb, cid);
      if (res && res.error) {
        var missing = /could not find the function|schema cache|PGRST202|404/i.test(text(res.error.message));
        last = emptySnapshot('subscription_required');
        last.backendReady = false;
        last.source = missing ? 'missing-rpc' : 'rpc-error';
        last.error = text(res.error.message);
        paint();
        return last;
      }
      var data = res && res.data;
      if (Array.isArray(data)) data = data[0];
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (_) {}
      }
      last = Object.assign({ backendReady: true, source: 'rpc', authority: 'server' }, data || {});
      lastAt = Date.now();
      paint();
      return last;
    } catch (err) {
      last = emptySnapshot('subscription_required');
      last.backendReady = false;
      last.source = 'rpc-error';
      last.error = text(err && err.message);
      paint();
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
    if (accessGateOpen() && !companyId()) {
      try {
        var login = document.getElementById('fireSLoginEmail') || document.getElementById('fireSDoLoginBtn');
        if (login && login.scrollIntoView) login.scrollIntoView({ block: 'center' });
      } catch (_) {}
      return;
    }
    var already = false;
    try {
      already = subscribeSectionShown();
    } catch (_) {}
    try {
      if (typeof root.fireSOpenSubscribe === 'function') {
        root.fireSOpenSubscribe();
      } else {
        var btn = document.getElementById('cmdSubscribeBtn');
        if (btn) btn.click();
      }
    } catch (_) {}
    if (!already) return;
    try {
      if (typeof root.fireSStartSubscribeCheckout === 'function') {
        root.fireSStartSubscribeCheckout();
      }
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
      '<button type="button" class="cloud-primary-btn fire-s-trial-banner-cta" id="fireSTrialBannerCta">Subscribe / Reactivate</button>';
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
        '<p id="fireSEntitlementBlockerStatus"></p>' +
        '<p id="fireSEntitlementBlockerTrial"></p>' +
        '<p id="fireSEntitlementBlockerPlan"></p>' +
        '<p id="fireSEntitlementBlockerCopy"></p>' +
        '<p>Inspections, reports, premises and photos stay in the cloud. They stay locked in the app until a new subscription is active. Nothing is deleted.</p>' +
        '<p>Need help? Email <a href="mailto:georgevdx@gmail.com">georgevdx@gmail.com</a>.</p>' +
        '<div class="fire-s-entitlement-blocker-actions">' +
          '<button type="button" class="cloud-primary-btn" id="fireSEntitlementBlockerSubscribe">Subscribe / Reactivate</button>' +
          '<button type="button" class="secondary-btn" id="fireSEntitlementBlockerHome">Subscribe / Reactivate</button>' +
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
        sendLockedActionToSubscribe();
      });
    }
    return el;
  }

  function nodeIsShown(node) {
    var cur = node;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (!cur) return false;
      if (cur.hidden) return false;
      try {
        if (cur.getAttribute && cur.hasAttribute('hidden')) return false;
      } catch (_) {}
      if (cur.style && (cur.style.display === 'none' || cur.style.visibility === 'hidden')) return false;
      cur = cur.parentElement;
    }
    return !!node;
  }

  function visibleWorkspaceId() {
    var ids = [
      'fireSSubscribeSection',
      'fireSSubscriptionRequiredSection',
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
      if (!nodeIsShown(node)) continue;
      return ids[i];
    }
    return 'homeSection';
  }

  function statusLabel(info) {
    var data = info || last || emptySnapshot();
    var status = text(data.status || data.reason);
    var reason = text(data.reason);
    if (data.super_admin) return 'Super Admin access';
    if (status === 'subscription_active') return 'Paid subscription active';
    if (status === 'trial_active' && reason === 'trial_limit_reached') return 'Trial inspections used';
    if (status === 'trial_active') return 'Active trial';
    if (status === 'trial_expired') return 'Trial ended';
    if (status === 'subscription_past_due' && (data.in_grace === true || reason === 'past_due_grace')) return 'Payment past due — grace period';
    if (status === 'subscription_cancelled') return 'Subscription cancelled';
    if (status === 'subscription_past_due') return 'Payment past due';
    if (status === 'payment_pending') return 'Payment pending';
    return 'Subscription required';
  }

  function trialLine(info) {
    var data = info || last || emptySnapshot();
    var expires = text(data.trial_ends_at || data.trial_expires_at);
    var days = Math.max(0, Number(data.trial_days_remaining) || 0);
    if (!expires && !days) return 'No active trial.';
    if (text(data.status) === 'trial_expired' || text(data.reason) === 'trial_expired') {
      return 'Trial expired' + (expires ? ' on ' + String(expires).slice(0, 10) : '') + '.';
    }
    if (days) return 'Trial: ' + days + ' day' + (days === 1 ? '' : 's') + ' remaining.';
    return expires ? 'Trial ends ' + String(expires).slice(0, 10) + '.' : '';
  }

  function planLine(info) {
    var data = info || last || emptySnapshot();
    var plan = text(data.plan) || 'standard';
    var interval = text(data.billing_interval || data.subscription_billing_interval);
    if (!interval) interval = 'monthly';
    return 'Plan: ' + plan + ' · ' + interval + ' billing.';
  }

  function fillRequiredCopy(rootElPrefix) {
    var statusEl = document.getElementById(rootElPrefix + 'Status');
    var trialEl = document.getElementById(rootElPrefix + 'Trial');
    var planEl = document.getElementById(rootElPrefix + 'Plan');
    if (statusEl) statusEl.textContent = 'Current status: ' + statusLabel(last);
    if (trialEl) trialEl.textContent = trialLine(last);
    if (planEl) planEl.textContent = planLine(last);
  }

  function hideWriteWorkspaces() {
    hideInspectionWorkspaces();
  }

  function openRequiredScreen() {
    pinLockedHome();
    fillRequiredCopy('fireSSubscriptionRequiredScreen');
    fillRequiredCopy('fireSSubscriptionRequired');
    fillRequiredCopy('fireSEntitlementBlocker');
    var panel = document.getElementById('fireSSubscriptionRequiredPanel');
    if (panel) panel.hidden = true;
  }

  function inspectionWorkspaceIsOpen() {
    for (var i = 0; i < INSPECTION_WORKSPACES.length; i += 1) {
      if (nodeIsShown(document.getElementById(INSPECTION_WORKSPACES[i]))) return true;
    }
    return false;
  }

  function showBlockerIfNeeded() {
    var blocker = ensureBlocker();
    fillRequiredCopy('fireSSubscriptionRequiredScreen');
    fillRequiredCopy('fireSSubscriptionRequired');
    var panel = document.getElementById('fireSSubscriptionRequiredPanel');
    if (panel) panel.hidden = true;
    if (accessGateOpen() || !inspectionAccessLocked()) {
      var homeLock = document.getElementById('fireSHomeLockPanel');
      if (homeLock) hideNode(homeLock);
      if (blocker) blocker.hidden = true;
      hideDesktopAccess();
      return;
    }
    var space = visibleWorkspaceId();
    if (space === 'fireSSubscribeSection') {
      if (blocker) blocker.hidden = true;
      hideLockedHomeChrome();
      if (panel) panel.hidden = true;
      return;
    }
    pinLockedHome();
  }

  function paint() {
    var copy = displayCopy(last);
    var banner = ensureBanner();
    var title = document.getElementById('fireSTrialBannerTitle');
    var detail = document.getElementById('fireSTrialBannerDetail');
    var cta = document.getElementById('fireSTrialBannerCta');
    if (banner) {
      if (!copy.show || isSuperAdmin() || inspectionAccessLocked()) {
        banner.hidden = true;
        banner.className = 'fire-s-trial-banner';
      } else {
        banner.hidden = false;
        banner.className = 'fire-s-trial-banner is-' + copy.urgency;
        if (title) title.textContent = copy.headline;
        if (detail) detail.textContent = copy.detail;
        if (cta) cta.textContent = copy.cta;
      }
    }
    try {
      syncHomeLayer();
    } catch (_) {}
    try {
      var cancelled =
        text(last && last.status) === 'subscription_cancelled' ||
        text(last && last.reason) === 'subscription_cancelled' ||
        text(last && last.reason) === 'cancelled_until_period_end';
      if (cancelled && root.fireSPayfast && typeof root.fireSPayfast.hideReturnBanner === 'function') {
        root.fireSPayfast.hideReturnBanner();
      }
    } catch (_) {}
    showBlockerIfNeeded();
    paintSubscribeHints(copy);
    try {
      enforceStaffSignOut();
    } catch (_) {}
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
      pinLockedHome();
    }
    return false;
  }

  async function assertCanFinalise() {
    if (isSuperAdmin()) return true;
    if (isLocalWorkspace()) return true;
    var info = await refresh();
    if (!info || !info.backendReady) {
      return deny('subscription_required');
    }
    if (info.can_finalise === true) return true;
    return deny(info.reason || 'subscription_required');
  }

  async function assertCanCreate() {
    if (isSuperAdmin()) return true;
    if (isLocalWorkspace()) return true;
    var info = await refresh();
    if (!info || !info.backendReady) {
      return deny('subscription_required');
    }
    if (info.can_create === true || info.allowed === true) return true;
    openRequiredScreen();
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

  function wrapCreateFn(holder, name) {
    if (!holder) return;
    var original = holder[name];
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
    holder[name] = wrapped;
  }

  function wrapOpenProject() {
    var names = ['openProject', 'openProjectAndReviewFindings', 'openProjectAndViewPhotos', 'openProjectAndGoToSchedule', 'openProjectAndGenerateReport', 'openProjectSummaryCard'];
    names.forEach(function (name) {
      var original = root[name];
      if (typeof original !== 'function' || original.__fireSEntitlementRead) return;
      var wrapped = function () {
        if (inspectionAccessLocked()) {
          pinLockedHome();
          return;
        }
        return original.apply(this, arguments);
      };
      wrapped.__fireSEntitlementRead = true;
      root[name] = wrapped;
    });
  }

  function wrapNewInspection() {
    var names = [
      'createNewInspection',
      'startNewInspection',
      'addNewProject',
      'createNewProject',
      'startNewInspectionForPremises',
      'archiveProjectCurrentInspectionAndStartBlank',
      'newPremises'
    ];
    names.forEach(function (name) {
      wrapCreateFn(root, name);
    });
    wrapCreateFn(root.FireSNewInspectionFlow, 'startNewInspection');
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

  function guardDirectUrl() {
    var bits = String((root.location && (root.location.hash || '')) || '') +
      String((root.location && (root.location.search || '')) || '');
    if (isSuperAdmin() || isLocalWorkspace()) return;
    if (inspectionAccessLocked()) {
      sendLockedActionToSubscribe();
      return;
    }
    if (!/newInspection|new-inspection|projectForm|createNewProject|inspect=new/i.test(bits)) return;
    if (last && last.backendReady && last.can_create === false) {
      sendLockedActionToSubscribe();
    }
  }

  function wireRequiredScreen() {
    function bind(id, fn) {
      var el = document.getElementById(id);
      if (!el || el.__fireSBound) return;
      el.__fireSBound = true;
      el.addEventListener('click', fn);
    }
    bind('fireSSubscriptionRequiredSubscribe', function (ev) {
      ev.preventDefault();
      openPlans();
    });
    bind('fireSSubscriptionRequiredScreenSubscribe', function (ev) {
      ev.preventDefault();
      openPlans();
    });
    bind('fireSSubscriptionRequiredBackBtn', function (ev) {
      ev.preventDefault();
      sendLockedActionToSubscribe();
    });
  }

  function wrapNavFns() {
    var names = [
      'showHome',
      'openInspectionsCommand',
      'openScheduleCommand',
      'openReports',
      'openReportsCommand',
      'showReports',
      'showProjectList',
      'showProjects',
      'openProjects',
      'openProjectsSafely',
      'openProjectsOnly',
      'showInspectionOpenGate',
      'showTestSamples',
      'showManagementDashboard',
      'showServices',
      'showCompanyTeam',
      'showFindingsCentre',
      'openPremisesCommandCentre',
      'openGateway',
      'fsExecutiveOpenGateway',
      'openOverdueCommand',
      'openFindingsCommand',
      'openSitesCommand',
      'showProjectForm',
      'openLatestReport'
    ];
    names.forEach(function (name) {
      var original = root[name];
      if (typeof original !== 'function' || original.__fireSEntitlementNav) return;
      var wrapped = function () {
        if (name === 'showHome') {
          var result = original.apply(this, arguments);
          if (inspectionAccessLocked()) pinLockedHome();
          return result;
        }
        if (inspectionAccessLocked()) {
          return pinLockedHome();
        }
        return original.apply(this, arguments);
      };
      wrapped.__fireSEntitlementNav = true;
      root[name] = wrapped;
    });
  }

  function wire() {
    wrapFinish();
    wrapNewInspection();
    wrapOpenProject();
    wrapNavFns();
    ensureBanner();
    ensureBlocker();
    wireRequiredScreen();
    syncHomeLayer();
    hideDesktopAccess();
    document.addEventListener('hashchange', guardDirectUrl);
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t) return;
      var subscribeAction = subscribeControlAction(t);
      if (subscribeAction) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        runSubscribeControl(subscribeAction);
        return;
      }
      if (inspectionAccessLocked() && !isAllowedLockedTarget(t)) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        pinLockedHome();
        return;
      }
      var id = t.id || '';
      var creating =
        id === 'newInspectionBtn' ||
        id === 'newProjectBtn' ||
        id === 'inspectorV4New' ||
        id === 'openGateStartBtn' ||
        id === 'fireSStartBlankInspectionV106' ||
        id === 'fireSStartInspectionCopyAnswersV106' ||
        id === 'startNewInspectionMoreBtn' ||
        (t.closest && (
          t.closest('#newInspectionBtn') ||
          t.closest('#newProjectBtn') ||
          t.closest('#inspectorV4New') ||
          t.closest('#openGateStartBtn')
        ));
      if (!creating) return;
      var info = last;
      if (info && info.backendReady && info.can_create === false && !isSuperAdmin()) {
        ev.preventDefault();
        ev.stopPropagation();
        deny(info.reason);
      }
    }, true);
    document.addEventListener('pointerdown', function (ev) {
      var subscribeAction = subscribeControlAction(ev.target);
      if (subscribeAction === 'home') {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
        runSubscribeControl('home');
        return;
      }
      if (subscribeAction === 'pay') return;
      if (!inspectionAccessLocked()) return;
      if (isAllowedLockedTarget(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
      pinLockedHome();
    }, true);
    setTimeout(function () {
      wrapNewInspection();
      wrapOpenProject();
      wrapNavFns();
      refresh().then(function () {
        guardDirectUrl();
        if (inspectionAccessLocked()) pinLockedHome();
      });
    }, 400);
    setTimeout(function () {
      wrapNewInspection();
      wrapOpenProject();
      wrapNavFns();
      if (inspectionAccessLocked()) pinLockedHome();
    }, 900);
    setTimeout(wrapNavFns, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  try { syncHomeLayer(); } catch (_) {}

  root.fireSEntitlement = {
    CONFIG: CONFIG,
    check: check,
    refresh: refresh,
    snapshot: snapshot,
    hasSnapshot: hasSnapshot,
    operationallyAllowed: operationallyAllowed,
    canFinalise: canFinalise,
    canCreate: canCreate,
    canRead: canRead,
    canExport: canExport,
    inspectionAccessLocked: inspectionAccessLocked,
    staffMustSignOut: staffMustSignOut,
    enforceStaffSignOut: enforceStaffSignOut,
    homeWorkAllowed: homeWorkAllowed,
    syncHomeLayer: syncHomeLayer,
    isAllowedLockedTarget: isAllowedLockedTarget,
    sendLockedActionToSubscribe: sendLockedActionToSubscribe,
    pinLockedHome: pinLockedHome,
    displayCopy: displayCopy,
    humanMessage: humanMessage,
    parseRpcError: parseRpcError,
    openPlans: openPlans,
    extendTrial: extendTrial,
    analytics: analytics,
    listCompanies: listCompanies,
    assertCanFinalise: assertCanFinalise,
    assertCanCreate: assertCanCreate,
    getCompanyEntitlement: check,
    isLocalWorkspace: isLocalWorkspace,
    openRequiredScreen: openRequiredScreen,
    statusLabel: statusLabel,
    trialLine: trialLine,
    paint: paint,
    blockMessage: blockMessage,
    guardDirectUrl: guardDirectUrl
  };
  root.checkCompanyEntitlement = function (id) {
    return check(id);
  };
  root.getCompanyEntitlement = function (id) {
    return check(id);
  };
})(window);
