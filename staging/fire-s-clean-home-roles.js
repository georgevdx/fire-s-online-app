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
    'cmdInspectorsBtn',
    'cmdScheduleBtn',
    'cmdReportsBtn',
    'cmdCompanyDetailsBtn',
    'cmdCompanyBtn',
    'cmdTestSamplesBtn',
    'cmdManagementDashboardBtn',
    'cmdSubscribeBtn',
    'cmdUserManualBtn',
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

  function gatewayButton() {
    const renamed = byId('cmdGatewayBtn');
    if (renamed && !byId('cmdInspectionsBtn')) {
      renamed.id = 'cmdInspectionsBtn';
    }
    return byId('cmdInspectionsBtn');
  }

  function showGatewayCard(title, copy) {
    const btn = gatewayButton();
    const grid = document.querySelector('#mainCommandCentre .main-command-grid');
    if (btn && grid && grid.firstElementChild !== btn) {
      grid.insertBefore(btn, grid.firstElementChild);
    }
    if (!btn) return;
    btn.hidden = false;
    btn.removeAttribute('aria-hidden');
    btn.removeAttribute('tabindex');
    wrapCommandCardText(btn);
    btn.style.removeProperty('display');
    if (getComputedStyle(btn).display === 'none') {
      btn.style.setProperty('display', 'flex', 'important');
    }
    if (title) {
      cardText('cmdInspectionsBtn', title, copy);
    }
  }

  function assertGatewayOnFrontPage(role) {
    if (
      ![
        'inspector',
        'manager',
        'company_owner',
        'super_admin',
        'viewer'
      ].includes(role)
    ) {
      return;
    }
    const grid = document.querySelector('#mainCommandCentre .main-command-grid');
    if (grid) {
      grid.style.setProperty('display', 'grid', 'important');
      grid.removeAttribute('hidden');
    }
    const copy =
      role === 'inspector'
        ? 'Find, continue or start an inspection.'
        : role === 'viewer'
          ? 'Search and open completed inspection work.'
          : 'Open, continue, search and manage inspections.';
    showGatewayCard('Inspection Gateway', copy);
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
      // Invited Inspector / Manager never Subscribe. The owner already paid
      // when they tapped Add. Staging used to treat every login as a new
      // company owner — that sent remote staff to the Subscribe page.
      if (
        actual === 'inspector' ||
        actual === 'manager' ||
        actual === 'viewer' ||
        actual === 'pending_member'
      ) {
        return 'pending_member';
      }
      try {
        if (window.localStorage && window.localStorage.getItem('fireS.joiningAsStaff.v1') === '1') {
          return 'pending_member';
        }
      } catch (_) {}
      // Empty test cloud: first person on the toets-blad is the Owner.
      try {
        if (window.FIRE_S_ENV && window.FIRE_S_ENV.isStaging) {
          return 'new_company';
        }
      } catch (_) {}
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

  const STICKY_COMMAND_ROLES = ['company_owner', 'manager', 'super_admin'];

  function resolveHomeRole() {
    const role = readRole();
    // Token refresh / profile reload can briefly look like a guest. Keep the
    // Owner Command Centre cards up until a real SIGNED_OUT clears lastRole.
    if (
      !roleTestActive() &&
      STICKY_COMMAND_ROLES.includes(lastRole) &&
      (!role || role === 'guest' || role === 'pending_member')
    ) {
      return lastRole;
    }
    if (role) lastRole = role;
    return role || lastRole || 'guest';
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
    const legacy = document.querySelector('#mainCommandCentre .main-command-stats');
    const ownerRow = byId('fireSOwnerKpiRow');
    if (visible) {
      if (legacy) {
        legacy.hidden = true;
        legacy.setAttribute('aria-hidden', 'true');
        legacy.style.setProperty('display', 'none', 'important');
      }
      if (ownerRow) {
        ownerRow.hidden = false;
        ownerRow.removeAttribute('aria-hidden');
        ownerRow.style.setProperty('display', 'grid', 'important');
      }
      try {
        if (typeof window.fireSProductionRenderKpis === 'function') {
          window.fireSProductionRenderKpis();
        }
      } catch (_) {}
    } else {
      if (legacy) {
        legacy.hidden = true;
        legacy.style.setProperty('display', 'none', 'important');
      }
      if (ownerRow) {
        ownerRow.hidden = true;
        ownerRow.style.setProperty('display', 'none', 'important');
      }
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

  function wrapCommandCardText(card) {
    if (!card || card.querySelector(':scope > .command-text')) return;
    const title = card.querySelector(':scope > .command-title');
    const copy = card.querySelector(':scope > .command-copy');
    if (!title && !copy) return;
    const wrap = document.createElement('span');
    wrap.className = 'command-text';
    const icon = card.querySelector(':scope > .command-icon');
    if (title) wrap.appendChild(title);
    if (copy) wrap.appendChild(copy);
    if (icon && icon.parentNode === card) icon.after(wrap);
    else card.appendChild(wrap);
  }

  function wrapAllCommandCards() {
    document.querySelectorAll('#mainCommandCentre .main-command-card').forEach(wrapCommandCardText);
  }

  function cardText(id, title, copy) {
    const card = byId(id);
    if (!card) return;
    wrapCommandCardText(card);
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
      'fire-s-role-viewer',
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
      'fireSExecutiveDashboard1115',
      'inspectorBoardHomeBar',
      'fireSOwnerLists'
    ].forEach(id => {
      const el = byId(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    });
    document
      .querySelectorAll(
        '.compliance-hero-card, .fire-s-exec-mini-dashboard, .fire-s-exec-dashboard-v1115'
      )
      .forEach(el => {
        if (el.classList.contains('main-command-stats')) return;
        el.style.setProperty('display', 'none', 'important');
      });
  }

  function applyInspectorHome() {
    showHomeHero();
    setBodyRole('fire-s-role-inspector', 'inspector');
    document.body.classList.add('fire-s-inspector-v4');

    const homeHero = document.querySelector('#homeSection .home-hero');
    if (homeHero) homeHero.style.setProperty('display', 'none', 'important');

    setText('#mainCommandCentre .main-command-kicker', 'Inspector Work Area');
    setText('#mainCommandCentre .main-command-top h3', 'Find or Start an Inspection');
    setText(
      '#mainCommandSubtitle',
      'Use Inspection Gateway below, or the Inspector Work Area.'
    );
    setText('#mainCommandAccessStatus', 'Inspector access');
    setStatsVisible(false);
    setBetaPanelsVisible(false);
    hideManagementOverlays();

    ALL_CMD_IDS.forEach(hide);
    hide('cmdInspectorsBtn');
    hide('inspectorBoardHomeBar');
    hide('cmdManagementDashboardBtn');
    // Keep Gateway visible so inspectors always have a clear entry.
    showGatewayCard(
      'Inspection Gateway',
      'Find, continue or start an inspection.'
    );
    show('cmdUserManualBtn');
    cardText(
      'cmdUserManualBtn',
      'User manual',
      'Download the inspection guide as a PDF.'
    );

    try {
      if (typeof window.fireSInspectorV4 === 'function') window.fireSInspectorV4();
    } catch (_) {}

    const shell = byId('inspectorV4Shell');
    if (shell) {
      shell.style.setProperty('display', 'flex', 'important');
      shell.removeAttribute('hidden');
      shell.setAttribute('aria-hidden', 'false');
    }

    const grid = document.querySelector('#mainCommandCentre .main-command-grid');
    if (grid) {
      grid.style.setProperty('display', 'grid', 'important');
      grid.removeAttribute('hidden');
    }
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
      centre.querySelectorAll('.main-command-top, .main-command-grid').forEach(el => {
        el.style.removeProperty('display');
        el.removeAttribute('hidden');
      });
      const legacyStats = centre.querySelector('.main-command-stats');
      if (legacyStats) {
        legacyStats.hidden = true;
        legacyStats.style.setProperty('display', 'none', 'important');
      }
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
    hide('cmdTestSamplesBtn');
    hide('cmdSubscribeBtn');

    cardText(
      'cmdInspectionsBtn',
      'Inspection Gateway',
      'Open, continue and review field inspections.'
    );
    cardText(
      'cmdInspectorsBtn',
      'Inspectors',
      'Select an inspector, view the whole team, or compare them.'
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
      'cmdCompanyDetailsBtn',
      'Company details',
      'Name, address, logo and contact numbers for the client PDF.'
    );
    cardText(
      'cmdCompanyBtn',
      'People',
      'Add Inspectors and Managers, or change roles.'
    );
    cardText(
      'cmdTestSamplesBtn',
      'Test samples',
      'Load 50 sample inspections, then delete them later.'
    );
    cardText(
      'cmdManagementDashboardBtn',
      'Management dashboard',
      'Power BI-style graphs on tablet, laptop or PC.'
    );
    cardText(
      'cmdUserManualBtn',
      'User manual',
      'Download the subscriber guide as a PDF.'
    );
    cardText(
      'cmdServicesBtn',
      'Support',
      'Request review or operational support.'
    );

    // Force Gateway visible even if older inspector CSS left it hidden.
    const grid = document.querySelector('#mainCommandCentre .main-command-grid');
    if (grid) {
      grid.style.setProperty('display', 'grid', 'important');
      grid.removeAttribute('hidden');
    }
    showGatewayCard(
      'Inspection Gateway',
      'Open, continue and review field inspections.'
    );

    try {
      if (typeof window.fireSRefreshDesktopAccess === 'function') {
        window.fireSRefreshDesktopAccess();
      }
    } catch (_) {}
    try {
      if (typeof window.fireSRefreshCompanyPersonnelStats === 'function') {
        window.fireSRefreshCompanyPersonnelStats();
      }
    } catch (_) {}
    try {
      if (typeof window.fireSRefreshOwnerLists === 'function') {
        window.fireSRefreshOwnerLists();
      }
    } catch (_) {}
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
    hide('cmdTestSamplesBtn');

    // Force Gateway visible even if older inspector CSS left it hidden.
    const grid = document.querySelector('#mainCommandCentre .main-command-grid');
    if (grid) {
      grid.style.setProperty('display', 'grid', 'important');
      grid.removeAttribute('hidden');
    }
    showGatewayCard(
      'Inspection Gateway',
      'Company-wide inspection search and oversight.'
    );
    cardText(
      'cmdInspectorsBtn',
      'Inspectors',
      'Select an inspector, view the whole team, or compare them.'
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
      'cmdCompanyDetailsBtn',
      'Company details',
      'Name, address, logo and contact numbers for the client PDF.'
    );
    cardText(
      'cmdCompanyBtn',
      'People',
      'Add Inspectors and Managers, or change roles.'
    );
    cardText(
      'cmdTestSamplesBtn',
      'Test samples',
      'Load 50 sample inspections, then delete them later.'
    );
    cardText(
      'cmdManagementDashboardBtn',
      'Management dashboard',
      'Power BI-style graphs on tablet, laptop or PC.'
    );
    cardText(
      'cmdSubscribeBtn',
      'Subscription',
      'View or change monthly or annual billing. You (the owner) pay. Fees show on that page.'
    );
    cardText(
      'cmdUserManualBtn',
      'User manual',
      'Download the subscriber guide as a PDF.'
    );
    cardText(
      'cmdServicesBtn',
      'Services / Support',
      'Consultancy, review requests and support.'
    );

    try {
      if (typeof window.fireSRefreshDesktopAccess === 'function') {
        window.fireSRefreshDesktopAccess();
      }
    } catch (_) {}
    try {
      if (typeof window.fireSRefreshCompanyPersonnelStats === 'function') {
        window.fireSRefreshCompanyPersonnelStats();
      }
    } catch (_) {}
    try {
      if (typeof window.fireSRefreshSubscribeCard === 'function') {
        window.fireSRefreshSubscribeCard();
      }
    } catch (_) {}
    try {
      if (typeof window.fireSRefreshOwnerLists === 'function') {
        window.fireSRefreshOwnerLists();
      }
    } catch (_) {}
  }

  function applyGuestHome() {
    showHomeHero();
    setBodyRole('fire-s-role-guest', 'guest');
    setHero('Fire-S', 'ACCESS', 'Type email and password to Login. Subscribing New Company on this same page.');
    setText('#mainCommandCentre .main-command-kicker', 'Access');
    setText('#mainCommandCentre .main-command-top h3', 'Access');
    setText(
      '#mainCommandSubtitle',
      'Use Access below. Login, Create password and Subscribe are on this one page. Cloud is only for sync after you are signed in.'
    );
    try {
      if (window.FIRE_S_ENV && window.FIRE_S_ENV.isStaging) {
        setText('#mainCommandCentre .main-command-kicker', 'Toets-blad');
        setText(
          '#mainCommandSubtitle',
          'One Access page: Login, Create password or Subscribe.'
        );
      }
    } catch (_) {}
    setText('#mainCommandAccessStatus', 'Not signed in');
    setStatsVisible(false);
    setBetaPanelsVisible(false);
    hideManagementOverlays();
    ALL_CMD_IDS.forEach(hide);
    hide('inspectorBoardHomeBar');
  }

  function applyViewerHome() {
    showHomeHero();
    setBodyRole('fire-s-role-viewer', 'viewer');
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
    show('cmdUserManualBtn');
    hide('cmdScheduleBtn');
    hide('cmdCompanyDetailsBtn');
    hide('cmdCompanyBtn');
    hide('cmdTestSamplesBtn');
    hide('cmdManagementDashboardBtn');
    hide('cmdSubscribeBtn');
    hide('cmdServicesBtn');
    hide('cmdInspectorsBtn');
    hide('inspectorBoardHomeBar');
    cardText(
      'cmdReportsBtn',
      'Reports',
      'Completed inspections and client-ready exports.'
    );
    cardText(
      'cmdUserManualBtn',
      'User manual',
      'Download the subscriber guide as a PDF.'
    );
    showGatewayCard(
      'Inspection Gateway',
      'Search and open completed inspection work.'
    );
    try {
      if (typeof window.fireSRefreshOwnerLists === 'function') {
        window.fireSRefreshOwnerLists();
      }
    } catch (_) {}
  }

  function applyPendingMemberHome() {
    showHomeHero();
    setBodyRole('fire-s-role-pending-member', 'pending_member');
    setHero('Fire-S', 'ALMOST READY', 'Your owner already added you. Create password once, then Login. Do not Subscribe — the owner pays.');
    setText('#mainCommandCentre .main-command-kicker', 'Waiting');
    setText('#mainCommandCentre .main-command-top h3', 'Join the company');
    setText(
      '#mainCommandSubtitle',
      'Use Access: First time? Create password, then Login. You do not Subscribe. Your owner pays for this email.'
    );
    setText('#mainCommandAccessStatus', 'Login ready · not in a company yet');
    setStatsVisible(false);
    setBetaPanelsVisible(false);
    hideManagementOverlays();
    ALL_CMD_IDS.forEach(hide);
    hide('inspectorBoardHomeBar');
  }

  function applyNewCompanyHome() {
    showHomeHero();
    setBodyRole('fire-s-role-new-company', 'new_company');
    setHero('Fire-S · New Company', 'SUBSCRIBE', 'Subscription per month per login is R250. Per year per login is R2 500. The main subscriber (owner) may invite inspectors to subscribe under the main company. Please see the user manual in Fire-S. Pay on PayFast.');
    setText('#mainCommandCentre .main-command-kicker', 'First-day setup');
    setText('#mainCommandCentre .main-command-top h3', 'Subscribe');
    setText(
      '#mainCommandSubtitle',
      'Use Access below to choose a package and save the company name once.'
    );
    setText('#mainCommandAccessStatus', 'New company setup');
    setStatsVisible(false);
    setBetaPanelsVisible(false);
    hideManagementOverlays();
    ALL_CMD_IDS.forEach(hide);
    hide('inspectorBoardHomeBar');
  }

  function isGatewayOrFormVisible() {
    const list = byId('projectListSection');
    const form = byId('projectFormSection');
    const shown = el => {
      if (!el || el.hidden) return false;
      if (el.style.display === 'none') return false;
      try {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      } catch (_) {
        return true;
      }
    };
    return shown(list) || shown(form);
  }

  function isPasswordRecoveryNow() {
    try {
      var api = window.fireSPasswordReset;
      if (api && typeof api.isCaptured === 'function') {
        return !!api.isCaptured(
          window.sessionStorage,
          window,
          window.location
        );
      }
    } catch (_) {}
    try {
      if (window.__fireSPasswordRecovery) return true;
      if (window.sessionStorage && sessionStorage.getItem('fireS.passwordRecovery') === '1') {
        return true;
      }
    } catch (_) {}
    try {
      var bits = String(window.location.hash || '') + String(window.location.search || '');
      if (/type=recovery/i.test(bits) || /token_hash=/i.test(bits) || /access_token=/i.test(bits)) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function paintRecoveryBody(on) {
    try {
      if (!document.body) return;
      if (on) {
        document.body.classList.add('fire-s-password-recovery');
        if (document.documentElement) {
          document.documentElement.classList.add('fire-s-password-recovery');
        }
      } else {
        document.body.classList.remove('fire-s-password-recovery');
        if (document.documentElement) {
          document.documentElement.classList.remove('fire-s-password-recovery');
        }
      }
    } catch (_) {}
  }

  function applyCleanHome() {
    const centre = byId('mainCommandCentre');
    if (!centre || !document.body) return;
    if (isPasswordRecoveryNow()) {
      applyGuestHome();
      paintRecoveryBody(true);
      try {
        const access = byId('fireSGetStarted');
        if (access) access.style.display = '';
      } catch (_) {}
      return;
    }
    paintRecoveryBody(false);
    if (isGatewayOrFormVisible()) return;

    wrapAllCommandCards();

    const role = resolveHomeRole();

    if (role === 'new_company') applyNewCompanyHome();
    else if (role === 'pending_member') applyPendingMemberHome();
    else if (role === 'inspector') applyInspectorHome();
    else if (role === 'manager') applyManagerHome();
    else if (role === 'company_owner' || role === 'super_admin') applyOwnerHome(role);
    else if (role === 'viewer') applyViewerHome();
    else applyGuestHome();

    assertGatewayOnFrontPage(role);

    // Keep Personnel / Inspectors cards wired after other Home controllers rebind clicks.
    try {
      if (
        (role === 'company_owner' || role === 'super_admin' || role === 'manager') &&
        typeof window.fireSOpenCompanyTeam === 'function'
      ) {
        const detailsBtn = byId('cmdCompanyDetailsBtn');
        if (detailsBtn && typeof window.fireSOpenCompanyLetterhead === 'function') {
          detailsBtn.onclick = function (event) {
            if (event) event.preventDefault();
            window.fireSOpenCompanyLetterhead();
          };
        }
        const testBtn = byId('cmdTestSamplesBtn');
        if (testBtn && typeof window.fireSOpenTestSamples === 'function') {
          testBtn.onclick = function (event) {
            if (event) event.preventDefault();
            window.fireSOpenTestSamples();
          };
        }
        const dashBtn = byId('cmdManagementDashboardBtn');
        if (dashBtn && typeof window.fireSOpenManagementDashboard === 'function') {
          dashBtn.onclick = function (event) {
            if (event) event.preventDefault();
            window.fireSOpenManagementDashboard();
          };
        }
        const reportsBtn = byId('cmdReportsBtn');
        if (reportsBtn && typeof window.openReportsCommand === 'function') {
          reportsBtn.onclick = function (event) {
            if (event) event.preventDefault();
            window.openReportsCommand();
          };
        }
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
      if (
        (role === 'company_owner' || role === 'super_admin' || role === 'manager') &&
        typeof window.fireSOpenInspectorBoard === 'function'
      ) {
        const btn = byId('cmdInspectorsBtn');
        if (btn) {
          btn.onclick = function (event) {
            if (event) event.preventDefault();
            window.fireSOpenInspectorBoard();
          };
        }
      }
    } catch (_) {}

    try {
      if (
        (role === 'company_owner' || role === 'super_admin' || role === 'manager' || role === 'viewer') &&
        typeof window.openReportsCommand === 'function'
      ) {
        const reportsBtn = byId('cmdReportsBtn');
        if (reportsBtn) {
          reportsBtn.onclick = function (event) {
            if (event) event.preventDefault();
            window.openReportsCommand();
          };
        }
      }
    } catch (_) {}

    try {
      if (typeof window.syncReportsCommandCardForExecHome === 'function') {
        window.syncReportsCommandCardForExecHome();
      }
    } catch (_) {}

    try {
      if (typeof window.fireSRefreshInspectorBoard === 'function') {
        window.fireSRefreshInspectorBoard();
      }
    } catch (_) {}

    try {
      if (typeof window.fireSSyncGetStarted === 'function') {
        window.fireSSyncGetStarted();
      }
    } catch (_) {}

    try {
      if (typeof window.fireSPaintExpiryReminder === 'function') {
        window.fireSPaintExpiryReminder();
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

  // KPI modules rebind cards after we set role-specific Home chrome — re-assert it.
  [
    'fireSRefreshManagementKpis134',
    'fireSSyncManagementCards132',
    'fireSSyncManagementCards133'
  ].forEach(name => {
    const original = window[name];
    if (typeof original !== 'function' || original.__fireSCleanHomeWrapped) return;
    const wrapped = function fireSCleanHomeAfterKpi() {
      const result = original.apply(this, arguments);
      Promise.resolve(result).finally(() => {
        setTimeout(applyCleanHome, 0);
        setTimeout(applyCleanHome, 80);
      });
      return result;
    };
    wrapped.__fireSCleanHomeWrapped = true;
    window[name] = wrapped;
  });
  window.fireSGetCompanyDisplayName = getCompanyDisplayName;

  // Run after existing home controller, then refine by role.
  const previousRender =
    typeof window.renderHomeCommandCentre === 'function'
      ? window.renderHomeCommandCentre
      : null;

  function cleanHomeRender() {
    if (isGatewayOrFormVisible()) return;
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
      client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') lastRole = '';
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
