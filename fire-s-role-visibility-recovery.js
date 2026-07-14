/* ============================================================
   FIRE-S Role Visibility Recovery Module
   Load AFTER app.js.
   Purpose:
   - Prevent "unknown/not-yet-loaded" roles from defaulting to inspector.
   - Restore role-specific Mission Control cards after Supabase profile loads.
   - Neutralise stale RC 1.2.1B/C/D/E inspector hard-lock classes.
   - Does not touch Gateway counts, filters, inspections or KPI calculations.
   ============================================================ */
(function fireSRoleVisibilityRecoveryModule() {
  'use strict';

  const ROLE_ALIASES = {
    'super-admin': 'super_admin',
    'superadmin': 'super_admin',
    'company-owner': 'company_owner',
    'company owner': 'company_owner',
    'field-inspector': 'inspector',
    'field inspector': 'inspector',
    'management': 'manager'
  };

  const SUPER_ROLES = new Set(['super_admin']);
  const MANAGEMENT_ROLES = new Set([
    'company_owner', 'owner', 'admin', 'company_admin',
    'manager', 'viewer', 'executive'
  ]);
  const INSPECTOR_ROLES = new Set(['inspector']);

  const CARD_IDS = [
    'cmdInspectionsBtn',
    'cmdScheduleBtn',
    'cmdDashboardBtn',
    'cmdReportsBtn',
    'cmdCompanyBtn',
    'cmdServicesBtn',
    'cmdFindingsBtn',
    'cmdOverdueBtn'
  ];

  const INSPECTOR_LOCK_CLASSES = [
    'fire-s-role-inspector',
    'fire-s-inspector-mode',
    'fire-s-phase1-inspector',
    'fire-s-inspector-access-121c',
    'fire-s-inspector-mission-lock-121d',
    'fire-s-inspector-mission-lock-121e'
  ];

  const MANAGEMENT_CLASSES = [
    'fire-s-role-management',
    'fire-s-phase1-management',
    'fire-s-management-mission-lock-121d',
    'fire-s-management-mission-lock-121e'
  ];

  let lastStableRole = '';
  let applyTimer = null;
  let profileWaitStartedAt = Date.now();

  function normaliseRole(value) {
    const raw = String(value || '').trim().toLowerCase();
    return ROLE_ALIASES[raw] || raw;
  }

  function readCandidateRoles() {
    const values = [];

    try {
      if (typeof window.getCurrentUserRole === 'function') {
        values.push(window.getCurrentUserRole());
      }
    } catch (_) {}

    try {
      if (window.currentUserProfile) {
        values.push(
          window.currentUserProfile.role,
          window.currentUserProfile.userRole,
          window.currentUserProfile.companyRole
        );
      }
    } catch (_) {}

    try {
      if (typeof currentUserProfile !== 'undefined' && currentUserProfile) {
        values.push(
          currentUserProfile.role,
          currentUserProfile.userRole,
          currentUserProfile.companyRole
        );
      }
    } catch (_) {}

    try {
      if (window.currentCompanyAccess) {
        values.push(
          window.currentCompanyAccess.role,
          window.currentCompanyAccess.userRole,
          window.currentCompanyAccess.companyRole
        );
      }
    } catch (_) {}

    try {
      if (typeof currentCompanyAccess !== 'undefined' && currentCompanyAccess) {
        values.push(
          currentCompanyAccess.role,
          currentCompanyAccess.userRole,
          currentCompanyAccess.companyRole
        );
      }
    } catch (_) {}

    return values.map(normaliseRole).filter(Boolean);
  }

  function resolveRole() {
    const candidates = readCandidateRoles();

    // Highest privilege wins where stale objects disagree.
    const superRole = candidates.find(role => SUPER_ROLES.has(role));
    if (superRole) return superRole;

    const managementRole = candidates.find(role => MANAGEMENT_ROLES.has(role));
    if (managementRole) return managementRole;

    const inspectorRole = candidates.find(role => INSPECTOR_ROLES.has(role));
    if (inspectorRole) return inspectorRole;

    // Critical fix: unknown/loading is NOT inspector.
    return '';
  }

  function getRoleState(role) {
    if (SUPER_ROLES.has(role)) return 'super';
    if (MANAGEMENT_ROLES.has(role)) return 'management';
    if (INSPECTOR_ROLES.has(role)) return 'inspector';
    return 'loading';
  }

  function clearInlineVisibility(el) {
    if (!el) return;
    el.classList.remove(
      'fire-s-inspector-hidden-card-121c',
      'fire-s-inspector-hidden-card-121d',
      'fire-s-inspector-hidden-card-121e'
    );
    el.removeAttribute('hidden');
    el.removeAttribute('aria-hidden');
    el.removeAttribute('tabindex');
    el.style.removeProperty('display');
    el.style.removeProperty('visibility');
    el.style.removeProperty('opacity');
    el.style.removeProperty('pointer-events');
  }

  function showCard(id) {
    const el = document.getElementById(id);
    if (!el) return;
    clearInlineVisibility(el);
    el.classList.add('fire-s-role-visible-recovery');
    el.style.setProperty('display', '', 'important');
    // Empty !important may be ignored by some browsers; use revert as fallback.
    if (getComputedStyle(el).display === 'none') {
      el.style.setProperty('display', 'block', 'important');
    }
  }

  function hideCard(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('fire-s-role-visible-recovery');
    el.style.setProperty('display', 'none', 'important');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('tabindex', '-1');
  }

  function clearRoleClasses() {
    if (!document.body) return;
    [...INSPECTOR_LOCK_CLASSES, ...MANAGEMENT_CLASSES].forEach(cls => {
      document.body.classList.remove(cls);
    });
  }

  function applyRoleVisibility() {
    if (!document.body) return;

    const resolvedRole = resolveRole();
    if (resolvedRole) {
      lastStableRole = resolvedRole;
    }

    const role = resolvedRole || lastStableRole;
    const state = getRoleState(role);

    clearRoleClasses();
    document.body.dataset.fireSResolvedRole = role || 'loading';
    document.body.classList.add(`fire-s-recovered-role-${state}`);

    // While auth/profile is still loading, do not hide management navigation.
    // This prevents the old fallback-to-inspector logic from winning.
    if (state === 'loading') {
      CARD_IDS.forEach(showCard);
      return;
    }

    if (state === 'inspector') {
      showCard('cmdInspectionsBtn');
      showCard('cmdScheduleBtn');

      [
        'cmdDashboardBtn',
        'cmdReportsBtn',
        'cmdCompanyBtn',
        'cmdServicesBtn',
        'cmdFindingsBtn',
        'cmdOverdueBtn'
      ].forEach(hideCard);

      document.body.classList.add('fire-s-role-inspector');
      return;
    }

    // Management and super-admin: restore all cards first.
    CARD_IDS.forEach(showCard);
    document.body.classList.add('fire-s-role-management');

    // Super-admin and management visibility can still be refined by the
    // app's own permission checks, but must never be forced into inspector mode.
  }

  function scheduleApply(delay = 0) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(applyRoleVisibility, delay);
  }

  // Expose a safe refresh hook for login/profile code.
  window.fireSRefreshRoleVisibility = function fireSRefreshRoleVisibility() {
    scheduleApply(0);
    setTimeout(applyRoleVisibility, 100);
    setTimeout(applyRoleVisibility, 500);
  };

  // Run after initial DOM and at auth-friendly intervals.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleApply(0), { once: true });
  } else {
    scheduleApply(0);
  }

  [100, 300, 700, 1500, 3000, 6000].forEach(ms => {
    setTimeout(applyRoleVisibility, ms);
  });

  // Re-apply after login/profile/navigation DOM changes. Attribute observation
  // is deliberate because the old hard-lock changes class/style attributes.
  const observer = new MutationObserver(() => scheduleApply(40));
  const startObserver = () => {
    if (!document.body) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });
  };

  if (document.body) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver, { once: true });

  // Auth event hook when Supabase is available.
  try {
    const client = window.supabaseClient;
    if (client && client.auth && typeof client.auth.onAuthStateChange === 'function') {
      client.auth.onAuthStateChange(() => {
        profileWaitStartedAt = Date.now();
        lastStableRole = '';
        window.fireSRefreshRoleVisibility();
      });
    }
  } catch (_) {}

  // Wrap common render functions without altering their results.
  [
    'renderHomeCommandCentre',
    'showHome',
    'showProjectList',
    'renderProjectsList',
    'loadCurrentUserProfile',
    'loadCompanyAccess'
  ].forEach(name => {
    const original = window[name];
    if (typeof original !== 'function' || original.__fireSRoleRecoveryWrapped) return;

    const wrapped = function fireSRoleRecoveryWrapped() {
      const result = original.apply(this, arguments);
      Promise.resolve(result).finally(() => window.fireSRefreshRoleVisibility());
      return result;
    };
    wrapped.__fireSRoleRecoveryWrapped = true;
    window[name] = wrapped;
  });
})();
