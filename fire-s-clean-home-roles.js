/* ============================================================
   Fire-S Clean Home Roles (Phase 2 / #1)
   Load AFTER app.js.
   Purpose:
   - One clean Home experience per role:
     inspector | manager | owner (company_owner / super_admin)
   - Hide beta / RC tester panels for normal users
   - Do not change Gateway counts, inspections, or sync logic
   ============================================================ */
(function fireSCleanHomeRoles() {
  'use strict';

  const ROLE_ALIASES = {
    'super-admin': 'super_admin',
    superadmin: 'super_admin',
    'company-owner': 'company_owner',
    'company owner': 'company_owner',
    owner: 'company_owner',
    admin: 'company_owner',
    company_admin: 'company_owner',
    executive: 'company_owner',
    new_company: 'new_company',
    'new-company': 'new_company',
    management: 'manager',
    'field-inspector': 'inspector',
    'field inspector': 'inspector',
    field_inspector: 'inspector'
  };

  const BETA_PANEL_IDS = [
    'betaNotesPanel',
    'betaQuickTestPanel',
    'releaseCandidatePanel',
    'rcBackupReminderPanel',
    'rcFinalPreflightPanel',
    'rcTesterInstructionPanel'
  ];

  const ALL_CMD_IDS = [
    'cmdInspectionsBtn',
    'cmdScheduleBtn',
    'cmdReportsBtn',
    'cmdCompanyBtn',
    'cmdServicesBtn',
    'cmdDashboardBtn',
    'cmdFindingsBtn',
    'cmdOverdueBtn'
  ];

  let applyTimer = null;
  let lastRole = '';
  let stickySuperAdmin = false;

  // This module owns Home hero / cards / role pages.
  window.__fireSCleanHomeOwnsRoleUi = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function normaliseRole(value) {
    const raw = String(value || '').trim().toLowerCase();
    return ROLE_ALIASES[raw] || raw;
  }

  function hasLinkedCompany() {
    try {
      if (window.currentUserProfile?.companyId) return true;
    } catch (_) {}
    try {
      if (typeof currentUserProfile !== 'undefined' && currentUserProfile?.companyId) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function isSignedInUser() {
    try {
      const id = window.currentUserProfile?.id ||
        (typeof currentUserProfile !== 'undefined' ? currentUserProfile?.id : '');
      if (!id || id === 'local-user') return false;
    } catch (_) {}
    try {
      const email = String(
        window.currentUserProfile?.email ||
          (typeof currentUserProfile !== 'undefined' ? currentUserProfile?.email : '') ||
          ''
      )
        .trim()
        .toLowerCase();
      if (!email || email === 'local@fire-s.app') return false;
    } catch (_) {}
    try {
      if (stickySuperAdmin || readActualLoginRole() === 'super_admin') {
        // Only treat as signed-in super admin when we have a real profile id.
        const id = window.currentUserProfile?.id || '';
        if (id && id !== 'local-user') return true;
      }
    } catch (_) {}
    try {
      const id = window.currentUserProfile?.id ||
        (typeof currentUserProfile !== 'undefined' ? currentUserProfile?.id : '');
      if (id && id !== 'local-user') return true;
    } catch (_) {}
    return false;
  }

  function readActualLoginRole() {
    try {
      if (typeof window.fireSActualUserRole131 === 'function') {
        const remembered = normaliseRole(window.fireSActualUserRole131());
        if (remembered === 'super_admin') stickySuperAdmin = true;
        if (remembered) return stickySuperAdmin && remembered !== 'super_admin'
          ? 'super_admin'
          : remembered;
      }
    } catch (_) {}
    try {
      const fromWindow = normaliseRole(window.currentUserProfile?.role);
      if (fromWindow === 'super_admin') stickySuperAdmin = true;
      if (fromWindow) {
        if (stickySuperAdmin && fromWindow !== 'super_admin') return 'super_admin';
        return fromWindow;
      }
    } catch (_) {}
    try {
      if (typeof currentUserProfile !== 'undefined') {
        const fromGlobal = normaliseRole(currentUserProfile?.role);
        if (fromGlobal === 'super_admin') stickySuperAdmin = true;
        if (fromGlobal) {
          if (stickySuperAdmin && fromGlobal !== 'super_admin') return 'super_admin';
          return fromGlobal;
        }
      }
    } catch (_) {}
    return stickySuperAdmin ? 'super_admin' : '';
  }

  function readViewedRole() {
    try {
      if (typeof window.fireSViewAsRole131 === 'function') {
        const viewed = normaliseRole(window.fireSViewAsRole131());
        if (viewed) return viewed;
      }
    } catch (_) {}
    try {
      const pref = normaliseRole(localStorage.getItem('fireS.viewAsRole.v131'));
      if (pref) return pref;
    } catch (_) {}
    return '';
  }

  function roleTestActive() {
    try {
      if (stickySuperAdmin || readActualLoginRole() === 'super_admin') return true;
    } catch (_) {}
    try {
      if (byId('fireSRoleTestModePanel') || byId('fireSRoleTestSelect')) return true;
    } catch (_) {}
    return false;
  }

  /**
   * Single Home role resolver.
   * Mapping:
   *  guest            → welcome
   *  pending_member   → Almost Ready (signed in, no company, not owner)
   *  new_company      → first-day company setup
   *  inspector        → Inspector Work Area / V4
   *  manager          → Operations Centre
   *  company_owner    → Owner Overview
   *  super_admin      → Control Overview
   * Role Test view-as overrides when Super Admin (sticky).
   */
  function readRole() {
    const actual = readActualLoginRole();
    const viewed = readViewedRole();

    // 1) Role Test wins for sticky Super Admin.
    if (roleTestActive()) {
      try {
        const pref = normaliseRole(localStorage.getItem('fireS.viewAsRole.v131'));
        if (pref) return pref;
      } catch (_) {}
      if (viewed) return viewed;
      if (actual === 'super_admin') return 'super_admin';
    }

    if (actual === 'super_admin') {
      return viewed || 'super_admin';
    }

    // 2) Logged out.
    if (!isSignedInUser()) return 'guest';

    // 3) Signed in, no company yet.
    if (!hasLinkedCompany()) {
      if (
        actual === 'company_owner' ||
        actual === 'owner' ||
        actual === 'super_admin'
      ) {
        return 'new_company';
      }
      // Managers without a company are unusual — treat as pending.
      return 'pending_member';
    }

    // 4) Linked company — use profile / getCurrentUserRole.
    if (viewed && viewed !== 'new_company' && roleTestActive()) return viewed;

    try {
      if (typeof window.getCurrentUserRole === 'function') {
        const current = normaliseRole(window.getCurrentUserRole());
        if (current && current !== 'new_company') return current;
      }
    } catch (_) {}

    if (actual) return actual;
    return 'guest';
  }

  function resolveHomeRole() {
    const role = readRole() || lastRole || 'guest';
    if (role) lastRole = role;
    return role;
  }

  window.resolveFireSHomeRole = resolveHomeRole;
  window.fireSResolveHomeRole = resolveHomeRole;

  function setText(selector, text) {
    const el =
      typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) el.textContent = text;
  }

  function show(id) {
    const el = byId(id);
    if (!el) return;
    el.hidden = false;
    el.removeAttribute('aria-hidden');
    el.removeAttribute('tabindex');
    el.style.setProperty('display', '', 'important');
    if (getComputedStyle(el).display === 'none') {
      el.style.setProperty('display', 'block', 'important');
    }
  }

  function hide(id) {
    const el = byId(id);
    if (!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('tabindex', '-1');
    el.style.setProperty('display', 'none', 'important');
  }

  function setStatsVisible(visible) {
    const stats = document.querySelector('#mainCommandCentre .main-command-stats');
    if (!stats) return;
    if (visible) {
      stats.hidden = false;
      stats.style.removeProperty('display');
    } else {
      stats.hidden = true;
      stats.style.setProperty('display', 'none', 'important');
    }
  }

  function setBetaPanelsVisible(visible) {
    BETA_PANEL_IDS.forEach(id => {
      const el = byId(id);
      if (!el) return;
      if (visible) {
        el.style.removeProperty('display');
        el.removeAttribute('hidden');
      } else {
        el.style.setProperty('display', 'none', 'important');
        el.setAttribute('hidden', 'true');
        el.innerHTML = '';
      }
    });
  }

  function cardText(id, title, copy) {
    const card = byId(id);
    if (!card) return;
    const titleEl = card.querySelector('.command-title, .route-title, strong');
    const copyEl = card.querySelector('.command-copy, .route-copy, p, small');
    if (titleEl) titleEl.textContent = title;
    if (copyEl) copyEl.textContent = copy;
    card.setAttribute('aria-label', title);
    card.title = title;
  }

  function setBodyRole(roleClass, cleanRoleKey) {
    if (!document.body) return;
    document.body.classList.remove(
      'fire-s-role-inspector',
      'fire-s-role-manager',
      'fire-s-role-owner',
      'fire-s-role-management',
      'fire-s-role-guest',
      'fire-s-role-new-company',
      'fire-s-role-pending-member',
      'fire-s-clean-home'
    );
    document.body.classList.remove('fire-s-inspector-v4');
    document.body.classList.add('fire-s-clean-home', roleClass);
    document.body.dataset.fireSCleanHomeRole =
      cleanRoleKey || roleClass.replace(/^fire-s-role-/, '').replace(/-/g, '_');
  }

  function setHero(kicker, title, subtitle) {
    setText('#homeSection .home-kicker', kicker);
    setText('#homeSection .home-hero h2', title);
    setText('#homeSection .home-hero p', subtitle);
  }

  function isGenericCompanyName(name) {
    const n = String(name || '').trim().toLowerCase();
    return (
      !n ||
      n === 'your company' ||
      n === 'your new company' ||
      n === 'local workspace' ||
      n === 'local / personal workspace'
    );
  }

  function getCompanyDisplayName() {
    try {
      const profile = window.currentUserProfile || {};
      const fromProfile = String(profile.companyName || '').trim();
      if (!isGenericCompanyName(fromProfile)) return fromProfile;
      const fromAccess = String(window.currentCompanyAccess?.companyName || '').trim();
      if (!isGenericCompanyName(fromAccess)) return fromAccess;
      const companyId = String(profile.companyId || '').trim();
      try {
        const raw = localStorage.getItem('fireS.cachedCompany');
        const cached = raw ? JSON.parse(raw) : null;
        const cachedName = String(cached?.name || '').trim();
        if (
          cachedName &&
          !isGenericCompanyName(cachedName) &&
          (!companyId || String(cached?.id || '') === companyId)
        ) {
          return cachedName;
        }
      } catch (_) {}
    } catch (_) {}
    return '';
  }

  function hideManagementOverlays() {
    [
      'complianceHeroCard',
      'executiveSnapshotCard',
      'executiveSnapshotPanel',
      'fireSExecutiveDashboard1115'
    ].forEach(id => {
      const el = byId(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    });
    document
      .querySelectorAll(
        '.compliance-hero-card, .fire-s-exec-mini-dashboard, .fire-s-exec-dashboard-v1115, .fs-prod-kpi-row, .fs-kpi-row'
      )
      .forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });
  }

  function applyInspectorHome() {
    setBodyRole('fire-s-role-inspector', 'inspector');
    document.body.classList.add('fire-s-inspector-v4');

    // Inspector V4 owns the main visual; keep outer hero quiet.
    const homeHero = document.querySelector('#homeSection .home-hero');
    if (homeHero) homeHero.style.setProperty('display', 'none', 'important');

    setText('#mainCommandCentre .main-command-kicker', 'Inspector Work Area');
    setText('#mainCommandCentre .main-command-top h3', 'Find or Start an Inspection');
    setText(
      '#mainCommandSubtitle',
      'Search a premises, continue an inspection, or start at a new site.'
    );
    setText('#mainCommandAccessStatus', 'Inspector access');
    setStatsVisible(false);
    setBetaPanelsVisible(false);
    hideManagementOverlays();

    ALL_CMD_IDS.forEach(hide);

    // Inspectors never set up a company — owner does that via Access.
    try {
      if (typeof window.fireSInspectorV4 === 'function') window.fireSInspectorV4();
    } catch (_) {}

    const shell = byId('inspectorV4Shell');
    if (shell) shell.style.setProperty('display', 'flex', 'important');
  }

  function showHomeHero() {
    const homeHero = document.querySelector('#homeSection .home-hero');
    if (homeHero) homeHero.style.removeProperty('display');
    document.body.classList.remove('fire-s-inspector-v4');
    const shell = byId('inspectorV4Shell');
    if (shell) {
      shell.style.setProperty('display', 'none', 'important');
      shell.setAttribute('hidden', 'true');
      shell.setAttribute('aria-hidden', 'true');
    }
    // Ensure management chrome is not left hidden by stale inspector CSS.
    const centre = byId('mainCommandCentre');
    if (centre) {
      centre.querySelectorAll('.main-command-top, .main-command-stats, .main-command-grid').forEach(el => {
        el.style.removeProperty('display');
        el.removeAttribute('hidden');
      });
    }
  }

  function applyManagerHome() {
    showHomeHero();
    setBodyRole('fire-s-role-manager', 'manager');
    const companyName = getCompanyDisplayName();
    setHero(
      'Fire-S · Manager',
      companyName || 'OPERATE',
      'Track actions, overdue work and inspection progress.'
    );
    const homeHero = document.querySelector('#homeSection .home-hero');
    if (homeHero) homeHero.classList.toggle('has-company-name', !!companyName);
    setText('#mainCommandCentre .main-command-kicker', 'Operations Centre');
    setText(
      '#mainCommandCentre .main-command-top h3',
      companyName || 'Today’s Operations'
    );
    setText(
      '#mainCommandSubtitle',
      'Operational view: actions required, overdue inspections and field activity.'
    );
    setText(
      '#mainCommandAccessStatus',
      companyName ? `${companyName} · Manager` : 'Manager access'
    );
    setStatsVisible(true);
    setBetaPanelsVisible(false);

    ALL_CMD_IDS.forEach(show);

    cardText(
      'cmdInspectionsBtn',
      'Inspection Gateway',
      'Open, continue and review field inspections.'
    );
    cardText(
      'cmdScheduleBtn',
      'Schedule',
      'Bookings, follow-ups and new-site planning.'
    );
    cardText(
      'cmdReportsBtn',
      'Reports',
      'Completed inspections and export-ready reports.'
    );
    cardText(
      'cmdCompanyBtn',
      'People',
      'Add Inspectors and Managers, or change roles.'
    );
    cardText(
      'cmdServicesBtn',
      'Support',
      'Request review or operational support.'
    );
  }

  function applyOwnerHome(role) {
    showHomeHero();
    setBodyRole('fire-s-role-owner', role === 'super_admin' ? 'super_admin' : 'owner');
    document.body.classList.add('fire-s-role-management');
    const companyName = getCompanyDisplayName();
    const isControl = role === 'super_admin';
    setHero(
      isControl ? 'Fire-S · Control' : 'Fire-S · Owner',
      companyName || 'OVERVIEW',
      'Company compliance, trends and strategic control.'
    );
    const homeHero = document.querySelector('#homeSection .home-hero');
    if (homeHero) homeHero.classList.toggle('has-company-name', !!companyName);
    setText('#mainCommandCentre .main-command-kicker', 'Executive Command Centre');
    setText(
      '#mainCommandCentre .main-command-top h3',
      companyName || 'Company Overview'
    );
    setText(
      '#mainCommandSubtitle',
      'Strategic view: compliance posture, overdue risk and company activity.'
    );
    setText(
      '#mainCommandAccessStatus',
      companyName
        ? `${companyName} · ${isControl ? 'Control' : 'Owner'}`
        : isControl
          ? 'Fire-S Control access'
          : 'Owner access'
    );
    setStatsVisible(true);
    setBetaPanelsVisible(role === 'super_admin');

    ALL_CMD_IDS.forEach(show);

    cardText(
      'cmdInspectionsBtn',
      'Inspection Gateway',
      'Company-wide inspection search and oversight.'
    );
    cardText(
      'cmdScheduleBtn',
      'Schedule',
      'Portfolio bookings and follow-up planning.'
    );
    cardText(
      'cmdReportsBtn',
      'Reports',
      'Completed inspections and client-ready exports.'
    );
    cardText(
      'cmdCompanyBtn',
      'People',
      'Add Inspectors and Managers, or change roles.'
    );
    cardText(
      'cmdServicesBtn',
      'Services / Support',
      'Consultancy, review requests and support.'
    );
  }

  function applyGuestHome() {
    showHomeHero();
    setBodyRole('fire-s-role-guest', 'guest');
    setHero('Fire-S', 'ACCESS', 'Login, create a password, or register your company.');
    setText('#mainCommandCentre .main-command-kicker', 'Access');
    setText('#mainCommandCentre .main-command-top h3', 'Start here');
    setText(
      '#mainCommandSubtitle',
      'Use the Access panel below. Cloud is only for sync after you are signed in.'
    );
    setText('#mainCommandAccessStatus', 'Not signed in');
    setStatsVisible(false);
    setBetaPanelsVisible(false);
    hideManagementOverlays();
    ALL_CMD_IDS.forEach(hide);
  }

  function applyViewerHome() {
    showHomeHero();
    setBodyRole('fire-s-role-guest', 'viewer');
    setHero('Fire-S · Viewer', 'REVIEW', 'Read-only view of reports and compliance status.');
    setText('#mainCommandCentre .main-command-kicker', 'Review Workspace');
    setText('#mainCommandCentre .main-command-top h3', 'Reports & Status');
    setText(
      '#mainCommandSubtitle',
      'View completed work and compliance overview. Editing is limited.'
    );
    setText('#mainCommandAccessStatus', 'Viewer access');
    setStatsVisible(true);
    setBetaPanelsVisible(false);

    show('cmdInspectionsBtn');
    show('cmdReportsBtn');
    show('cmdDashboardBtn');
    show('cmdFindingsBtn');
    show('cmdOverdueBtn');
    hide('cmdScheduleBtn');
    hide('cmdCompanyBtn');
    hide('cmdServicesBtn');
  }

  function applyPendingMemberHome() {
    showHomeHero();
    setBodyRole('fire-s-role-pending-member', 'pending_member');
    setHero('Fire-S', 'ALMOST READY', 'Your login works. Wait for your owner to add you.');
    setText('#mainCommandCentre .main-command-kicker', 'Waiting');
    setText('#mainCommandCentre .main-command-top h3', 'Ask your owner to add you');
    setText(
      '#mainCommandSubtitle',
      'They add your email in Personnel. Then tap Check again in Access.'
    );
    setText('#mainCommandAccessStatus', 'Login ready · not in a company yet');
    setStatsVisible(false);
    setBetaPanelsVisible(false);
    hideManagementOverlays();
    ALL_CMD_IDS.forEach(hide);
  }

  function applyNewCompanyHome() {
    showHomeHero();
    setBodyRole('fire-s-role-new-company', 'new_company');
    setHero('Fire-S · New Company', 'REGISTER', 'Save your company name, then manage personnel.');
    setText('#mainCommandCentre .main-command-kicker', 'First-day setup');
    setText('#mainCommandCentre .main-command-top h3', 'Register your company');
    setText(
      '#mainCommandSubtitle',
      'Use Access below to save the company name once.'
    );
    setText('#mainCommandAccessStatus', 'New company setup');
    setStatsVisible(false);
    setBetaPanelsVisible(false);
    hideManagementOverlays();
    ALL_CMD_IDS.forEach(hide);
  }

  function applyCleanHome() {
    const centre = byId('mainCommandCentre');
    if (!centre || !document.body) return;

    const role = resolveHomeRole();

    if (role === 'new_company') applyNewCompanyHome();
    else if (role === 'pending_member') applyPendingMemberHome();
    else if (role === 'inspector') applyInspectorHome();
    else if (role === 'manager') applyManagerHome();
    else if (role === 'company_owner' || role === 'super_admin') applyOwnerHome(role);
    else if (role === 'viewer') applyViewerHome();
    else applyGuestHome();

    // Keep Personnel card wired after other Home controllers rebind clicks.
    try {
      if (
        (role === 'company_owner' || role === 'super_admin' || role === 'manager') &&
        typeof window.fireSOpenCompanyTeam === 'function'
      ) {
        const btn = byId('cmdCompanyBtn');
        if (btn) {
          btn.onclick = function (event) {
            if (event) event.preventDefault();
            window.fireSOpenCompanyTeam();
          };
        }
      }
    } catch (_) {}

    try {
      if (typeof window.fireSSyncGetStarted === 'function') {
        window.fireSSyncGetStarted();
      }
    } catch (_) {}
  }

  function scheduleApply(delay) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(applyCleanHome, delay);
  }

  function bindRoleTestRefresh() {
    const select = byId('fireSRoleTestSelect');
    if (!select || select.__fireSCleanHomeBound) return;
    select.__fireSCleanHomeBound = true;
    select.addEventListener('change', () => {
      setTimeout(() => {
        try { applyCleanHome(); } catch (_) {}
        try {
          if (typeof window.fireSInspectorV4 === 'function') window.fireSInspectorV4();
        } catch (_) {}
      }, 0);
      setTimeout(applyCleanHome, 120);
      setTimeout(() => {
        try {
          if (typeof window.fireSInspectorV4 === 'function') window.fireSInspectorV4();
        } catch (_) {}
      }, 160);
    });
  }

  window.fireSApplyCleanHomeRoles = function fireSApplyCleanHomeRoles() {
    scheduleApply(0);
    setTimeout(applyCleanHome, 120);
    setTimeout(applyCleanHome, 600);
    setTimeout(bindRoleTestRefresh, 50);
  };
  window.refreshCleanHomeRoles = window.fireSApplyCleanHomeRoles;
  window.fireSGetCompanyDisplayName = getCompanyDisplayName;

  // Run after existing home controller, then refine by role.
  const previousRender =
    typeof window.renderHomeCommandCentre === 'function'
      ? window.renderHomeCommandCentre
      : null;

  function cleanHomeRender() {
    if (typeof previousRender === 'function' && !previousRender.__fireSCleanHome) {
      try {
        previousRender();
      } catch (_) {}
    }
    applyCleanHome();
  }
  cleanHomeRender.__fireSCleanHome = true;

  window.renderHomeCommandCentre = cleanHomeRender;
  try {
    renderHomeCommandCentre = cleanHomeRender;
  } catch (_) {}

  const previousShowHome =
    typeof window.showHome === 'function' ? window.showHome : null;

  function cleanShowHome() {
    if (typeof previousShowHome === 'function' && !previousShowHome.__fireSCleanHome) {
      try {
        previousShowHome();
      } catch (_) {}
    }
    // Re-assert Role Test selection before applying Home, so Back Home from
    // Inspection Gateway cannot fall into Almost Ready / pending_member.
    try {
      const select = byId('fireSRoleTestSelect');
      const pref = localStorage.getItem('fireS.viewAsRole.v131');
      if (select && pref) select.value = pref;
      if (typeof window.fireSApplyRoleAndManagementCards131 === 'function') {
        window.fireSApplyRoleAndManagementCards131();
      }
    } catch (_) {}
    applyCleanHome();
  }
  cleanShowHome.__fireSCleanHome = true;
  window.showHome = cleanShowHome;
  try {
    showHome = cleanShowHome;
  } catch (_) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleApply(0), {
      once: true
    });
  } else {
    scheduleApply(0);
  }

  [200, 800].forEach(ms => {
    setTimeout(applyCleanHome, ms);
    setTimeout(bindRoleTestRefresh, ms);
  });
  bindRoleTestRefresh();

  try {
    const client = window.supabaseClient;
    if (client && client.auth && typeof client.auth.onAuthStateChange === 'function') {
      client.auth.onAuthStateChange(() => {
        lastRole = '';
        window.fireSApplyCleanHomeRoles();
      });
    }
  } catch (_) {}

  [
    'loadCurrentUserProfile',
    'loadCompanyAccess',
    'fireSRenderHomeController130'
  ].forEach(name => {
    const original = window[name];
    if (typeof original !== 'function' || original.__fireSCleanHomeWrapped) return;
    const wrapped = function fireSCleanHomeWrapped() {
      const result = original.apply(this, arguments);
      Promise.resolve(result).finally(() => window.fireSApplyCleanHomeRoles());
      return result;
    };
    wrapped.__fireSCleanHomeWrapped = true;
    window[name] = wrapped;
  });
})();
