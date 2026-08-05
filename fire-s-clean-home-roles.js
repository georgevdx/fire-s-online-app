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
      if (id && id !== 'local-user') return true;
    } catch (_) {}
    // Role Test / Cloud can briefly lose profile.id while still logged in.
    try {
      if (readActualLoginRole() === 'super_admin') return true;
    } catch (_) {}
    try {
      const email =
        window.currentUserProfile?.email ||
        (typeof currentUserProfile !== 'undefined' ? currentUserProfile?.email : '');
      if (email && email.includes('@')) return true;
    } catch (_) {}
    return false;
  }

  function readActualLoginRole() {
    try {
      if (typeof window.fireSActualUserRole131 === 'function') {
        const remembered = normaliseRole(window.fireSActualUserRole131());
        if (remembered) return remembered;
      }
    } catch (_) {}
    try {
      const fromWindow = normaliseRole(window.currentUserProfile?.role);
      if (fromWindow) return fromWindow;
    } catch (_) {}
    try {
      if (typeof currentUserProfile !== 'undefined') {
        const fromGlobal = normaliseRole(currentUserProfile?.role);
        if (fromGlobal) return fromGlobal;
      }
    } catch (_) {}
    return '';
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

  function readRole() {
    // Super Admin Role Test Mode wins first — even if profile id is briefly missing.
    // Otherwise Home falls back to Guest and hides Personnel while the Role Test
    // panel still says “View as Company Owner”.
    try {
      const actual = readActualLoginRole();
      if (actual === 'super_admin') {
        const viewed = readViewedRole();
        if (viewed) return viewed;
        return 'super_admin';
      }
    } catch (_) {}

    // Logged out: always guest.
    try {
      if (!isSignedInUser()) return 'guest';
    } catch (_) {}

    // Signed in but not linked to a company yet.
    // Owners → finish company setup. Inspectors → wait to be added.
    // Skip this when Role Test is actively viewing another workspace.
    try {
      if (isSignedInUser() && !hasLinkedCompany()) {
        const role = readActualLoginRole();
        if (role === 'company_owner' || role === 'super_admin' || role === 'owner') {
          return 'new_company';
        }
        return 'pending_member';
      }
    } catch (_) {}

    try {
      const viewed = readViewedRole();
      if (viewed && viewed !== 'new_company') return viewed;
    } catch (_) {}

    try {
      if (typeof window.getCurrentUserRole === 'function') {
        const current = normaliseRole(window.getCurrentUserRole());
        if (current && current !== 'new_company') return current;
      }
    } catch (_) {}

    try {
      if (window.currentUserProfile?.role) {
        return normaliseRole(window.currentUserProfile.role);
      }
    } catch (_) {}

    try {
      if (typeof currentUserProfile !== 'undefined' && currentUserProfile?.role) {
        return normaliseRole(currentUserProfile.role);
      }
    } catch (_) {}

    return '';
  }

  function resolveHomeRole() {
    const role = readRole() || lastRole || 'guest';
    if (role) lastRole = role;
    return role;
  }

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

  function setBodyRole(roleClass) {
    if (!document.body) return;
    document.body.classList.remove(
      'fire-s-role-inspector',
      'fire-s-role-manager',
      'fire-s-role-owner',
      'fire-s-role-management',
      'fire-s-role-guest',
      'fire-s-role-new-company',
      'fire-s-clean-home'
    );
    document.body.classList.add('fire-s-clean-home', roleClass);
    document.body.dataset.fireSCleanHomeRole = roleClass.replace('fire-s-role-', '');
  }

  function setHero(kicker, title, subtitle) {
    setText('#homeSection .home-kicker', kicker);
    setText('#homeSection .home-hero h2', title);
    setText('#homeSection .home-hero p', subtitle);
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
    setBodyRole('fire-s-role-inspector');
    document.body.classList.remove('fire-s-role-owner', 'fire-s-role-manager', 'fire-s-role-management');
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

    // First-time signed-in users (no company yet) need a path to create one.
    try {
      const hasCompany = !!(
        window.currentUserProfile?.companyId ||
        (typeof currentUserProfile !== 'undefined' && currentUserProfile?.companyId)
      );
      if (!hasCompany) {
        show('cmdCompanyBtn');
        cardText(
          'cmdCompanyBtn',
          'Set up company',
          'Create your company to add Inspectors and Managers.'
        );
      }
    } catch (_) {}

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
    setBodyRole('fire-s-role-manager');
    setHero('Fire-S · Manager', 'OPERATE', 'Track actions, overdue work and inspection progress.');
    setText('#mainCommandCentre .main-command-kicker', 'Operations Centre');
    setText('#mainCommandCentre .main-command-top h3', 'Today’s Operations');
    setText(
      '#mainCommandSubtitle',
      'Operational view: actions required, overdue inspections and field activity.'
    );
    setText('#mainCommandAccessStatus', 'Manager access');
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
      'Personnel',
      'Add people, change roles, or remove staff.'
    );
    cardText(
      'cmdServicesBtn',
      'Support',
      'Request review or operational support.'
    );
  }

  function applyOwnerHome(role) {
    showHomeHero();
    setBodyRole('fire-s-role-owner');
    document.body.classList.add('fire-s-role-management');
    document.body.dataset.fireSCleanHomeRole =
      role === 'super_admin' ? 'super_admin' : 'owner';
    setHero(
      role === 'super_admin' ? 'Fire-S · Control' : 'Fire-S · Owner',
      'OVERVIEW',
      'Company compliance, trends and strategic control.'
    );
    setText('#mainCommandCentre .main-command-kicker', 'Executive Command Centre');
    setText('#mainCommandCentre .main-command-top h3', 'Company Overview');
    setText(
      '#mainCommandSubtitle',
      'Strategic view: compliance posture, overdue risk and company activity.'
    );
    setText(
      '#mainCommandAccessStatus',
      role === 'super_admin' ? 'Fire-S Control access' : 'Owner access'
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
      'Personnel',
      'Add people, change roles, or remove staff.'
    );
    cardText(
      'cmdServicesBtn',
      'Services / Support',
      'Consultancy, review requests and support.'
    );
  }

  function applyGuestHome() {
    showHomeHero();
    setBodyRole('fire-s-role-guest');
    setHero('Fire-S', 'WELCOME', 'Login, join a company, or start a new one.');
    setText('#mainCommandCentre .main-command-kicker', 'Welcome');
    setText('#mainCommandCentre .main-command-top h3', 'Fire-S');
    setText(
      '#mainCommandSubtitle',
      'Choose Login, Join a company, or Start a new company below.'
    );
    setText('#mainCommandAccessStatus', 'Local / guest');
    setStatsVisible(false);
    setBetaPanelsVisible(false);
    hideManagementOverlays();

    show('cmdInspectionsBtn');
    show('cmdScheduleBtn');
    [
      'cmdReportsBtn',
      'cmdCompanyBtn',
      'cmdServicesBtn',
      'cmdDashboardBtn',
      'cmdFindingsBtn',
      'cmdOverdueBtn'
    ].forEach(hide);

    cardText(
      'cmdInspectionsBtn',
      'Inspection Gateway',
      'Open or continue local inspection work.'
    );
    cardText(
      'cmdScheduleBtn',
      'Schedule / New Site',
      'Start a new inspection at a new site.'
    );
  }

  function applyViewerHome() {
    showHomeHero();
    setBodyRole('fire-s-role-manager');
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

  function applyNewCompanyHome() {
    showHomeHero();
    setBodyRole('fire-s-role-new-company');
    document.body.dataset.fireSCleanHomeRole = 'new_company';
    setHero('Fire-S · New Company', 'START', 'Create your company, then appoint your team.');
    setText('#mainCommandCentre .main-command-kicker', 'First-day setup');
    setText('#mainCommandCentre .main-command-top h3', 'Start your company');
    setText(
      '#mainCommandSubtitle',
      'Create the company once, then add Inspectors and Managers.'
    );
    setText('#mainCommandAccessStatus', 'New company setup');
    setStatsVisible(false);
    setBetaPanelsVisible(false);
    hideManagementOverlays();

    ALL_CMD_IDS.forEach(hide);
    // Get Started form is the main action — keep the old Company card hidden.
  }

  function applyPendingMemberHome() {
    showHomeHero();
    setBodyRole('fire-s-role-guest');
    document.body.dataset.fireSCleanHomeRole = 'pending_member';
    setHero('Fire-S', 'ALMOST READY', 'Your login works. Wait for your owner to add you.');
    setText('#mainCommandCentre .main-command-kicker', 'Waiting');
    setText('#mainCommandCentre .main-command-top h3', 'Ask your owner to add you');
    setText(
      '#mainCommandSubtitle',
      'Tell them your email. They add you in Company → Team as Inspector or Manager.'
    );
    setText('#mainCommandAccessStatus', 'Login ready · not in a company yet');
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
