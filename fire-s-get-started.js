/**
 * Fire-S Access Gate (from-scratch)
 * ---------------------------------
 * ONE place for login / create password / register company.
 * Cloud menu no longer owns auth for normal users.
 *
 * Modes:
 *   login     → Access page (email, password, Login, plus Create password / Subscribe)
 *   create    → invited staff, first time
 *   register  → new business owner
 *   company   → signed in, still need company name
 *   waiting   → signed in, waiting for owner invite
 *   reset     → opened the email reset link, choose a new password
 *   choices   → same as login (kept so old Open Access callers stay on one page)
 */
(function fireSAccessGate() {
  'use strict';

  var mode = 'login';
  var wired = false;
  var root = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function agreedToLegal(checkboxId) {
    var box = byId(checkboxId);
    return !!(box && box.checked);
  }

  function ensureEls() {
    root = byId('fireSGetStarted');
    return !!root;
  }

  function getSb() {
    try {
      if (window.supabaseClient) return window.supabaseClient;
    } catch (_) {}
    try {
      if (typeof supabaseClient !== 'undefined') return supabaseClient;
    } catch (_) {}
    return null;
  }

  function homeRole() {
    try {
      if (typeof window.resolveFireSHomeRole === 'function') {
        return text(window.resolveFireSHomeRole()).toLowerCase();
      }
    } catch (_) {}
    try {
      return text(document.body && document.body.dataset && document.body.dataset.fireSCleanHomeRole).toLowerCase();
    } catch (_) {}
    return '';
  }

  function profile() {
    try {
      return window.currentUserProfile || null;
    } catch (_) {
      return null;
    }
  }

  function isRealUser() {
    var p = profile();
    if (!p || !p.id) return false;
    if (p.id === 'local-user') return false;
    var email = text(p.email).toLowerCase();
    if (!email || email === 'local@fire-s.app') return false;
    return true;
  }

  function hasCompany() {
    var p = profile();
    return !!(p && p.companyId);
  }

  function isStagingEnv() {
    try {
      return !!(window.FIRE_S_ENV && window.FIRE_S_ENV.isStaging);
    } catch (_) {
      return false;
    }
  }

  function isFreshCompanyStart() {
    try {
      var role = text(window.currentUserProfile && window.currentUserProfile.role).toLowerCase();
      if (role !== 'super_admin') {
        try {
          localStorage.removeItem('fireS.forceNewCompanySetup');
        } catch (_) {}
        return homeRole() === 'new_company';
      }
    } catch (_) {}
    try {
      if (localStorage.getItem('fireS.forceNewCompanySetup') === '1') return true;
    } catch (_) {}
    return homeRole() === 'new_company';
  }

  var PENDING_SUBSCRIBE_KEY = 'fireS.pendingSubscribe.v1';
  var JOINING_AS_STAFF_KEY = 'fireS.joiningAsStaff.v1';
  var RECOVERY_KEY = 'fireS.passwordRecovery';

  function resetApi() {
    try {
      return window.fireSPasswordReset || null;
    } catch (_) {
      return null;
    }
  }

  function markPasswordRecovery() {
    var api = resetApi();
    if (api && typeof api.captureFromLocation === 'function') {
      // keepFlag: do not wipe a live PASSWORD_RECOVERY flag after the hash was cleaned
      api.captureFromLocation(window.location, window.sessionStorage, window, true);
      return;
    }
    window.__fireSPasswordRecovery = true;
    try {
      sessionStorage.setItem(RECOVERY_KEY, '1');
    } catch (_) {}
  }

  function isPasswordRecovery() {
    var api = resetApi();
    if (api && typeof api.isCaptured === 'function') {
      return api.isCaptured(window.sessionStorage, window, window.location);
    }
    try {
      if (window.__fireSPasswordRecovery) return true;
      if (sessionStorage.getItem(RECOVERY_KEY) === '1') return true;
    } catch (_) {}
    try {
      var bits = String(window.location.hash || '') + String(window.location.search || '');
      if (/type=recovery/i.test(bits) || /token_hash=/i.test(bits)) return true;
    } catch (_) {}
    return false;
  }

  function clearPasswordRecovery() {
    var api = resetApi();
    if (api && typeof api.clear === 'function') {
      api.clear(window.sessionStorage, window);
      return;
    }
    window.__fireSPasswordRecovery = false;
    try {
      sessionStorage.removeItem(RECOVERY_KEY);
    } catch (_) {}
  }

  function markJoiningAsStaff() {
    try {
      localStorage.setItem(JOINING_AS_STAFF_KEY, '1');
    } catch (_) {}
  }

  function clearJoiningAsStaff() {
    try {
      localStorage.removeItem(JOINING_AS_STAFF_KEY);
    } catch (_) {}
  }

  function isJoiningAsStaff() {
    try {
      return localStorage.getItem(JOINING_AS_STAFF_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function savePendingSubscribe(company, email, intervalId) {
    try {
      localStorage.setItem(
        PENDING_SUBSCRIBE_KEY,
        JSON.stringify({
          company: company,
          email: email,
          interval: intervalId || 'monthly',
          at: Date.now()
        })
      );
    } catch (_) {}
  }

  function readPendingSubscribe() {
    try {
      var raw = localStorage.getItem(PENDING_SUBSCRIBE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !text(data.company)) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function clearPendingSubscribe() {
    try {
      localStorage.removeItem(PENDING_SUBSCRIBE_KEY);
    } catch (_) {}
  }

  function canRegisterCompany() {
    if (hasCompany()) return false;
    if (isJoiningAsStaff()) return false;
    var role = homeRole();
    if (
      role === 'pending_member' ||
      role === 'inspector' ||
      role === 'manager' ||
      role === 'viewer'
    ) {
      return false;
    }
    // Empty test cloud: first person on the toets-blad is the Owner.
    if (isStagingEnv()) return true;
    if (isFreshCompanyStart()) return true;
    if (
      role === 'owner' ||
      role === 'company_owner' ||
      role === 'super_admin'
    ) {
      return false;
    }
    return true;
  }

  function setStatus(msg, isError) {
    var el = byId('fireSGetStartedStatus');
    if (!el) return;
    if (!msg) {
      el.style.display = 'none';
      el.textContent = '';
      el.className = 'fire-s-get-started-status';
      return;
    }
    el.style.display = 'block';
    el.textContent = String(msg);
    el.className =
      'fire-s-get-started-status' + (isError ? ' is-error' : '');
  }

  function notifySubscribe(company, email, intervalId) {
    try {
      if (typeof window.fireSNotifyCompanyS === 'function') {
        window.fireSNotifyCompanyS({
          kind: 'subscribe',
          company: company,
          email: email,
          billedTo: email,
          interval: intervalId,
          role: 'Owner'
        });
      }
    } catch (_) {}
  }

  function hidePanels() {
    [
      'fireSGetStartedChoices',
      'fireSGetStartedLoginFields',
      'fireSGetStartedResetFields',
      'fireSGetStartedCreateFields',
      'fireSGetStartedGuestFields',
      'fireSGetStartedCompanyOnly',
      'fireSGetStartedWaiting'
    ].forEach(function (id) {
      var el = byId(id);
      if (el) el.style.display = 'none';
    });
  }

  function setTitle(title, help) {
    var titleEl = byId('fireSGetStartedTitle');
    var helpEl = byId('fireSGetStartedHelp');
    if (titleEl) titleEl.textContent = title;
    if (helpEl) helpEl.textContent = help;
  }

  function showPanel(id) {
    var el = byId(id);
    if (el) el.style.display = '';
  }

  function closeCloudPanels() {
    ['cloudDropdown', 'cloudMenu', 'cloudPanel'].forEach(function (id) {
      var el = byId(id);
      if (el) el.style.display = 'none';
    });
  }

  function hideAccess() {
    if (isPasswordRecovery()) {
      showAccess();
      return;
    }
    if (root) root.style.display = 'none';
    try {
      if (typeof window.fireSMaybeOpenDesktopWorkspace === 'function') {
        window.fireSMaybeOpenDesktopWorkspace();
      }
    } catch (_) {}
  }

  function showAccess() {
    if (root) root.style.display = '';
  }

  function refreshHomeChrome() {
    try {
      if (typeof window.fireSApplyCleanHomeRoles === 'function') {
        window.fireSApplyCleanHomeRoles();
      }
    } catch (_) {}
    try {
      if (typeof window.fireSApplySimpleCloudSync === 'function') {
        window.fireSApplySimpleCloudSync();
      }
    } catch (_) {}
    try {
      document.dispatchEvent(new CustomEvent('fire-s:auth-changed'));
    } catch (_) {}
  }

  async function syncCloudAfterAuth() {
    try {
      if (typeof window.refreshSyncData === 'function') {
        setStatus('Loading your inspections from cloud…');
        await window.refreshSyncData();
        return;
      }
    } catch (_) {}
    try {
      if (typeof refreshSyncData === 'function') {
        setStatus('Loading your inspections from cloud…');
        await refreshSyncData();
      }
    } catch (_) {}
  }

  function enterAppHome(msg) {
    clearJoiningAsStaff();
    if (msg) setStatus(msg);
    hideAccess();
    closeCloudPanels();
    try {
      if (typeof window.showHome === 'function') window.showHome();
    } catch (_) {}
    refreshHomeChrome();
    setTimeout(function () {
      hideAccess();
      try {
        if (typeof window.showHome === 'function') window.showHome();
      } catch (_) {}
      refreshHomeChrome();
      try {
        if (typeof window.fireSInspectorV4 === 'function') window.fireSInspectorV4();
      } catch (_) {}
      try {
        if (typeof window.renderHomeCommandCentre === 'function') {
          window.renderHomeCommandCentre();
        }
      } catch (_) {}
    }, 300);
  }

  async function hasPendingInviteQuiet() {
    try {
      var sb = getSb();
      if (!sb || !sb.from) return false;
      var email = '';
      try {
        var userRes = await sb.auth.getUser();
        email = text(
          userRes && userRes.data && userRes.data.user && userRes.data.user.email
        ).toLowerCase();
      } catch (_) {}
      if (!email) email = text(profile() && profile().email).toLowerCase();
      if (!email) return false;
      var res = await sb
        .from('company_invites')
        .select('id, email, status')
        .eq('status', 'pending')
        .limit(30);
      if (res.error || !Array.isArray(res.data)) return false;
      return res.data.some(function (row) {
        return text(row && row.email).toLowerCase() === email;
      });
    } catch (_) {
      return false;
    }
  }

  var lastJoinError = '';

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function waitForAuthSession() {
    var sb = getSb();
    if (!sb || !sb.auth) return null;
    try {
      var sessionRes = await sb.auth.getSession();
      if (sessionRes && sessionRes.data && sessionRes.data.session) {
        return sessionRes.data.session;
      }
    } catch (_) {}
    try {
      var userRes = await sb.auth.getUser();
      return (userRes && userRes.data && userRes.data.user) || null;
    } catch (_) {
      return null;
    }
  }

  function rememberJoinedCompany(companyId, companyName, role) {
    var id = text(companyId);
    if (!id) return;
    var patch = {
      companyId: id,
      companyName: text(companyName) || (profile() && profile().companyName) || 'Your company',
      role: text(role) || 'inspector'
    };
    try {
      if (typeof window.fireSApplyUserProfilePatch === 'function') {
        window.fireSApplyUserProfilePatch(patch);
        return;
      }
    } catch (_) {}
    try {
      if (window.currentUserProfile) {
        window.currentUserProfile.companyId = patch.companyId;
        window.currentUserProfile.companyName = patch.companyName;
        window.currentUserProfile.role = patch.role;
      }
    } catch (_) {}
  }

  async function joinFromVisibleInvites() {
    var sb = getSb();
    if (!sb || !sb.from || !sb.auth) return 0;
    var userRes = await sb.auth.getUser();
    var user = userRes && userRes.data && userRes.data.user;
    if (!user || !user.id) return 0;
    var email = text(user.email).toLowerCase();
    if (!email) return 0;
    var inv = await sb
      .from('company_invites')
      .select('id, company_id, role, email, status')
      .eq('status', 'pending')
      .limit(30);
    var rows = Array.isArray(inv.data) ? inv.data : [];
    var mine = rows.filter(function (row) {
      return text(row && row.email).toLowerCase() === email;
    });
    if (!mine.length) {
      var inv2 = await sb
        .from('company_invites')
        .select('id, company_id, role, email, status')
        .ilike('email', email)
        .eq('status', 'pending')
        .limit(5);
      mine = Array.isArray(inv2.data) ? inv2.data : [];
    }
    var joined = 0;
    for (var i = 0; i < mine.length; i += 1) {
      var row = mine[i];
      if (!row || !row.company_id) continue;
      var upsert = await sb.from('company_members').upsert(
        {
          company_id: row.company_id,
          user_id: user.id,
          role: text(row.role) || 'inspector',
          status: 'active'
        },
        { onConflict: 'company_id,user_id' }
      );
      if (upsert && upsert.error) {
        lastJoinError = text(upsert.error.message) || lastJoinError;
        continue;
      }
      rememberJoinedCompany(row.company_id, '', text(row.role) || 'inspector');
      joined += 1;
    }
    return joined;
  }

  async function claimInvitesQuiet() {
    lastJoinError = '';
    var sb = getSb();
    if (!sb || !sb.rpc) return 0;
    await waitForAuthSession();
    var claimed = 0;
    try {
      var res = await sb.rpc('fire_s_claim_my_invites');
      if (res && res.error) {
        lastJoinError = text(res.error.message);
      } else if (Array.isArray(res && res.data)) {
        claimed = res.data.length;
        if (claimed && res.data[0]) {
          rememberJoinedCompany(
            res.data[0].out_company_id || res.data[0].company_id,
            res.data[0].out_company_name || res.data[0].company_name,
            res.data[0].out_role || res.data[0].role
          );
        }
      } else if (res && res.data) {
        claimed = 1;
        rememberJoinedCompany(
          res.data.out_company_id || res.data.company_id,
          res.data.out_company_name || res.data.company_name,
          res.data.out_role || res.data.role
        );
      }
    } catch (err) {
      lastJoinError = text(err && err.message);
    }
    if (claimed > 0 || hasCompany()) return claimed || 1;
    try {
      var extra = await joinFromVisibleInvites();
      if (extra > 0) return extra;
    } catch (err2) {
      lastJoinError = text(err2 && err2.message) || lastJoinError;
    }
    return 0;
  }

  async function joinCompanyAfterLogin() {
    var claimed = 0;
    var i;
    for (i = 0; i < 3; i += 1) {
      claimed = await claimInvitesQuiet();
      await refreshMembership();
      if (claimed > 0 || hasCompany()) return claimed || 1;
      await delay(400);
    }
    return 0;
  }

  async function refreshMembership() {
    try {
      if (typeof window.loadUserAccessProfile === 'function') {
        await window.loadUserAccessProfile();
        return;
      }
    } catch (_) {}
    try {
      if (typeof loadUserAccessProfile === 'function') {
        await loadUserAccessProfile();
      }
    } catch (_) {}
  }

  function openPersonnelAfterCreate() {
    try {
      if (typeof window.fireSOpenCompanyTeam === 'function') {
        window.fireSOpenCompanyTeam({ afterCreate: true });
        return;
      }
    } catch (_) {}
    try {
      if (typeof window.openCompanyTeamOverlay === 'function') {
        window.openCompanyTeamOverlay({ afterCreate: true });
      }
    } catch (_) {}
  }

  function rememberCompany(name, companyId) {
    try {
      if (typeof window.fireSRememberCompanyName === 'function' && companyId) {
        window.fireSRememberCompanyName(companyId, name);
      }
    } catch (_) {}
    try {
      if (window.currentUserProfile) {
        window.currentUserProfile.companyName = name || window.currentUserProfile.companyName;
        if (companyId) window.currentUserProfile.companyId = companyId;
      }
    } catch (_) {}
  }

  function parseCompanyRpc(rpc, fallbackName) {
    if (!rpc || rpc.error || !rpc.data) return null;
    var row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    if (!row) return null;
    return {
      id: row.out_company_id || row.company_id || row.id || null,
      name:
        row.out_company_name ||
        row.company_name ||
        row.name ||
        fallbackName ||
        ''
    };
  }

  function catalog() {
    try {
      return window.fireSSubscriptionCatalog || null;
    } catch (_) {
      return null;
    }
  }

  function fillPlanPicker(containerId, selectedId) {
    var cat = catalog();
    var box = byId(containerId);
    if (!cat || !cat.renderPlanPicker || !box) return;
    cat.renderPlanPicker(box, selectedId || (cat.defaultPlanId || 'executive'));
  }

  function fillBillingPicker(containerId, selectedId) {
    var cat = catalog();
    var box = byId(containerId);
    if (!cat || !cat.renderBillingPicker || !box) return;
    cat.renderBillingPicker(box, selectedId || (cat.defaultIntervalId || 'monthly'));
  }

  function chosenPlan(containerId) {
    var cat = catalog();
    var box = byId(containerId);
    if (cat && cat.selectedPlanFrom) return cat.selectedPlanFrom(box);
    return 'executive';
  }

  function chosenInterval(containerId) {
    var cat = catalog();
    var box = byId(containerId);
    if (cat && cat.selectedIntervalFrom) return cat.selectedIntervalFrom(box);
    return 'monthly';
  }

  async function saveChosenPlan(planId, intervalId) {
    var cat = catalog();
    if (!cat || !cat.persistCompanyPlan) return;
    try {
      await cat.persistCompanyPlan(planId, intervalId);
    } catch (_) {}
    try {
      if (typeof window.fireSRefreshSubscribeCard === 'function') {
        window.fireSRefreshSubscribeCard();
      }
    } catch (_) {}
  }

  function paintAccessKicker() {
    var kicker = root && root.querySelector('.fire-s-get-started-kicker');
    if (kicker) {
      kicker.textContent = isStagingEnv() ? 'Toets-blad · Access' : 'Fire-S Access';
    }
  }

  function paintAccessChoices() {
    paintAccessKicker();
  }

  function paintSubscribeForm() {
    var guestBack =
      byId('fireSGetStartedGuestFields') &&
      byId('fireSGetStartedGuestFields').querySelector('[data-fire-s-back]');
    if (guestBack) guestBack.style.display = '';
    var guestNote = byId('fireSRegisterNote');
    if (guestNote) {
      guestNote.textContent = isStagingEnv()
        ? 'One Subscribe creates the login and the company. Use the same email you already use for Supabase.'
        : 'Creates your owner login and this company name. One person is one company. If you already belong to a company, only that Owner can remove you. Then you can Subscribe here. You (the owner) pay R250 / month (or R2 500 / year) per subscription. Inspectors do not pay. Phone and desktop share that email. No card is taken yet.';
    }
    var loginLink = byId('fireSRegisterSwitchToLoginBtn');
    if (loginLink) loginLink.style.display = '';
  }

  function paintLoginForm() {
    paintAccessKicker();
    var loginBack =
      byId('fireSGetStartedLoginFields') &&
      byId('fireSGetStartedLoginFields').querySelector('[data-fire-s-back]');
    if (loginBack) loginBack.style.display = 'none';
    var subscribeBtn = byId('fireSLoginSubscribeBtn');
    if (subscribeBtn) {
      // Keep the blue Subscribe control on the first phone screen.
      // Staff / already-registered taps are still blocked in showRegister().
      subscribeBtn.hidden = false;
      subscribeBtn.removeAttribute('hidden');
      subscribeBtn.style.display = '';
    }
  }

  function showChoices() {
    showLogin();
  }

  function showLogin() {
    mode = 'login';
    hidePanels();
    paintLoginForm();
    setTitle(
      'Access',
      'Type your email and password, then Login. First time after your owner added you: Create password. New business owner: Subscribe.'
    );
    showPanel('fireSGetStartedLoginFields');
    var createToggle = byId('fireSSwitchToCreateBtn');
    if (createToggle) createToggle.style.display = '';
    setStatus('');
  }

  function showResetPassword() {
    mode = 'reset';
    markPasswordRecovery();
    hidePanels();
    paintAccessKicker();
    setTitle(
      'Choose a new password',
      'You opened the reset link. Type a new password twice, then Save. After that, Login with the new password.'
    );
    showPanel('fireSGetStartedResetFields');
    setStatus('');
    setTimeout(function () {
      var field = byId('fireSResetPassword');
      if (field) field.focus();
    }, 80);
  }

  function showCreatePassword() {
    mode = 'create';
    markJoiningAsStaff();
    hidePanels();
    setTitle(
      'Create password',
      'Use the email your owner added under Personnel. You do not Subscribe. Your owner already pays for this email. This is only needed once.'
    );
    showPanel('fireSGetStartedCreateFields');
    setStatus('');
  }

  function showRegister() {
    var role = homeRole();
    if (role === 'pending_member') {
      showWaiting();
      setStatus(
        'Your owner already added you. Use Login or Create password. Do not Subscribe.',
        true
      );
      return;
    }
    // Phone Access can still carry a leftover Create-password flag or company
    // id. Those used to bounce this tap back to Login with no visible change.
    clearJoiningAsStaff();
    mode = 'register';
    hidePanels();
    paintSubscribeForm();
    setTitle(
      'Subscribe',
      isStagingEnv()
        ? 'One Subscribe. Type a company name and the same email you already use for Supabase.'
        : 'You become the Owner of this company name. One person is one company. If you already belong to a company, only that Owner can remove you first. You pay R250 per subscription per month, or R2 500 per year. Inspectors do not pay. Next you manage personnel.'
    );
    showPanel('fireSGetStartedGuestFields');
    fillBillingPicker('fireSRegisterBillingOptions', 'monthly');
    setStatus('');
    try {
      var form = byId('fireSGetStartedGuestFields');
      if (form && form.scrollIntoView) form.scrollIntoView({ block: 'start' });
    } catch (_) {}
  }

  function showCompanyOnly() {
    if (!canRegisterCompany()) {
      hideAccess();
      enterAppHome('');
      return;
    }
    mode = 'company';
    hidePanels();
    setTitle(
      'Name your company',
      'You are signed in. You pay monthly (R250) or annual (R2 500) per subscription. Inspectors do not pay. Then manage personnel.'
    );
    showPanel('fireSGetStartedCompanyOnly');
    fillBillingPicker('fireSCompanyOnlyBillingOptions', 'monthly');
    setStatus('');
  }

  function showWaiting() {
    mode = 'waiting';
    hidePanels();
    setTitle(
      'Almost ready',
      'Your owner added your email. Create password once, then Login. You do not Subscribe — the owner pays for this email.'
    );
    showPanel('fireSGetStartedWaiting');
    var startBtn = byId('fireSWaitingStartCompanyBtn');
    if (startBtn) {
      var hideOwner = isJoiningAsStaff() || homeRole() === 'pending_member';
      startBtn.style.display = hideOwner ? 'none' : '';
      startBtn.hidden = hideOwner;
    }
    setStatus('');
  }

  function shouldShowAccess() {
    if (isPasswordRecovery()) return true;
    var role = homeRole();
    if (
      role === 'inspector' ||
      role === 'manager' ||
      role === 'owner' ||
      role === 'company_owner' ||
      role === 'super_admin' ||
      role === 'viewer'
    ) {
      return false;
    }
    if (role === 'guest' || role === 'new_company' || role === 'pending_member') {
      return true;
    }
    if (!isRealUser()) return true;
    return !hasCompany();
  }

  function render() {
    if (!ensureEls()) return;

    if (isPasswordRecovery()) {
      showAccess();
      showResetPassword();
      return;
    }

    if (!shouldShowAccess()) {
      hideAccess();
      return;
    }

    showAccess();
    var role = homeRole();

    if (role === 'pending_member') {
      showWaiting();
      return;
    }

    if (role === 'new_company' || (isRealUser() && !hasCompany() && canRegisterCompany())) {
      showCompanyOnly();
      return;
    }

    // Logged out: one Access page with Login. Create password / Subscribe stay on that page.
    if (!isRealUser()) {
      if (mode === 'create') showCreatePassword();
      else if (mode === 'register') showRegister();
      else showLogin();
      return;
    }

    if (mode === 'login') showLogin();
    else if (mode === 'create') showCreatePassword();
    else if (mode === 'register') showRegister();
    else if (mode === 'company') showCompanyOnly();
    else if (mode === 'waiting') showWaiting();
    else showLogin();
  }

  function authErrorMessage(err) {
    var msg = text(err && (err.message || err.error_description || err));
    var low = msg.toLowerCase();
    if (low.indexOf('invalid login') >= 0 || low.indexOf('invalid credentials') >= 0) {
      return 'Wrong password for that email. Try again, or use Forgot password. Do not use Create password again if this email already exists.';
    }
    if (
      low.indexOf('rate') >= 0 ||
      low.indexOf('only request this after') >= 0 ||
      low.indexOf('over_email_send_rate_limit') >= 0
    ) {
      return 'Wait one minute, then tap Forgot password once. Check Inbox and Junk — Outlook and Live often hide the Supabase email.';
    }
    if (
      low.indexOf('expired') >= 0 ||
      (low.indexOf('invalid') >= 0 && low.indexOf('token') >= 0) ||
      low.indexOf('otp_expired') >= 0
    ) {
      return 'That reset link is no longer valid. Tap Forgot password once more, wait a minute, and open the new email.';
    }
    if (
      low.indexOf('no longer has the reset code') >= 0 ||
      low.indexOf('keep #access_token=') >= 0
    ) {
      return 'This page no longer has the reset code. Close the tab. Open the newest email and use that link. Then Save.';
    }
    if (low.indexOf('open the reset link') >= 0) {
      return 'This page no longer has the reset code. Close the tab. Open the newest email and use that link. Then Save.';
    }
    if (low.indexOf('localhost:3000') >= 0) {
      return 'Close that page. Open the newest email and tap the link there. Fire-S must open by itself.';
    }
    if (
      low.indexOf('already registered') >= 0 ||
      low.indexOf('already been registered') >= 0 ||
      low.indexOf('user already exists') >= 0 ||
      low.indexOf('email address is already') >= 0
    ) {
      return 'This email already has a login. Use Login on phone and desktop. Do not Subscribe or Create password again — one email is one login the owner pays for.';
    }
    return msg || 'Something went wrong.';
  }

  async function finishSignedInSession(successMsg) {
    var claimed = await joinCompanyAfterLogin();
    mode = 'login';
    refreshHomeChrome();
    if (claimed > 0 || hasCompany()) {
      clearPendingSubscribe();
      clearJoiningAsStaff();
      await syncCloudAfterAuth();
      enterAppHome(
        successMsg || (claimed > 0 ? 'You are on the team. You do not Subscribe — your owner pays.' : 'Signed in.')
      );
      return;
    }
    if (await finishPendingSubscribeIfAny()) return;
    var invited = isJoiningAsStaff() || (await hasPendingInviteQuiet());
    if (invited) {
      showWaiting();
      setStatus(
        lastJoinError
          ? lastJoinError
          : 'Your owner already added you and pays for this email. Tap Check again to open Home. Do not Subscribe.'
      );
      return;
    }
    if (canRegisterCompany()) {
      setStatus('Signed in. Subscribe with your company name next.');
      showCompanyOnly();
      return;
    }
    showWaiting();
    setStatus(
      lastJoinError || 'Signed in. Tap Check again. If Home does not open, ask your owner to add this email under People again.'
    );
  }

  function accessRedirectUrl() {
    var api = resetApi();
    if (api && typeof api.accessRedirectUrl === 'function') {
      try {
        return api.accessRedirectUrl(window.FIRE_S_ENV, window.location);
      } catch (_) {}
    }
    try {
      var path = String(window.location.pathname || '/');
      path = path.replace(/index\.html$/i, '');
      if (!path.endsWith('/')) path += '/';
      return String(window.location.origin || '') + path;
    } catch (_) {
      return '';
    }
  }

  async function doForgotPassword(fromCreate) {
    var emailField = fromCreate ? byId('fireSCreateEmail') : byId('fireSLoginEmail');
    var email = text(emailField && emailField.value).toLowerCase();
    if (!email) {
      setStatus('Enter the email first, then tap Forgot password.', true);
      return;
    }
    var sb = getSb();
    if (!sb || !sb.auth) {
      setStatus('Cloud is not ready yet. Wait a moment and try again.', true);
      return;
    }
    setStatus('Sending password reset email…');
    try {
      var redirectTo = accessRedirectUrl();
      var opts = redirectTo ? { redirectTo: redirectTo } : undefined;
      var res = await sb.auth.resetPasswordForEmail(email, opts);
      if (res.error) throw res.error;
      setStatus(
        'Check Inbox AND Junk for ' +
          email +
          '. The email is from Supabase, not Fire-S. Open the link in that email — Fire-S opens on Choose a new password. Tap Forgot password only once, then wait a minute.'
      );
    } catch (e) {
      setStatus(authErrorMessage(e), true);
    }
  }

  async function doSaveNewPassword() {
    var password = (byId('fireSResetPassword') && byId('fireSResetPassword').value) || '';
    var again = (byId('fireSResetPassword2') && byId('fireSResetPassword2').value) || '';
    if (!password || !again) {
      setStatus('Type the new password twice.', true);
      return;
    }
    if (password.length < 6) {
      setStatus('Password must be at least 6 characters.', true);
      return;
    }
    if (password !== again) {
      setStatus('The two passwords do not match.', true);
      return;
    }
    var sb = getSb();
    if (!sb || !sb.auth) {
      setStatus('Cloud is not ready yet. Wait a moment and try again.', true);
      return;
    }
    setStatus('Saving new password…');
    try {
      var api = resetApi();
      if (api && typeof api.ensureRecoverySession === 'function') {
        await api.ensureRecoverySession(sb, window.sessionStorage);
      }
      var res = await sb.auth.updateUser({ password: password });
      if (res.error) throw res.error;
      try {
        byId('fireSResetPassword').value = '';
        byId('fireSResetPassword2').value = '';
      } catch (_) {}
      try {
        if (byId('fireSLoginPassword')) byId('fireSLoginPassword').value = '';
      } catch (_) {}
      try {
        if (sb.auth && typeof sb.auth.signOut === 'function') {
          await Promise.race([
            Promise.resolve(sb.auth.signOut()),
            new Promise(function (resolve) {
              setTimeout(resolve, 1200);
            })
          ]);
        }
      } catch (_) {}
      clearPasswordRecovery();
      showLogin();
      setStatus('Password saved. Login with the new password.');
    } catch (e) {
      setStatus(authErrorMessage(e), true);
    }
  }

  function stripRecoveryFromAddress() {
    try {
      var loc = window.location;
      var bits = String(loc.hash || '') + String(loc.search || '');
      if (!/type=recovery/i.test(bits) && !/access_token=/i.test(bits) && !/token_hash=/i.test(bits)) {
        return;
      }
      var path = String(loc.pathname || '/');
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', path + '#/');
      } else {
        loc.hash = '/';
      }
    } catch (_) {}
  }

  function leaveReset() {
    clearPasswordRecovery();
    stripRecoveryFromAddress();
    showLogin();
    setStatus('Reset cancelled. Login, or tap Forgot password again.');
    try {
      var sb = getSb();
      if (sb && sb.auth && typeof sb.auth.signOut === 'function') {
        Promise.resolve(sb.auth.signOut()).catch(function () {});
      }
    } catch (_) {}
  }

  async function doLogin() {
    var email = text(byId('fireSLoginEmail') && byId('fireSLoginEmail').value).toLowerCase();
    var password = (byId('fireSLoginPassword') && byId('fireSLoginPassword').value) || '';
    if (!email || !password) {
      setStatus('Enter email and password.', true);
      return;
    }
    var sb = getSb();
    if (!sb || !sb.auth) {
      setStatus('Cloud is not ready yet. Wait a moment and try again.', true);
      return;
    }
    setStatus('Signing in…');
    try {
      var res = await sb.auth.signInWithPassword({ email: email, password: password });
      if (res.error) throw res.error;
      await finishSignedInSession('Signed in.');
    } catch (e) {
      setStatus(authErrorMessage(e), true);
    }
  }

  async function doCreatePassword() {
    var email = text(
      byId('fireSCreateEmail') && byId('fireSCreateEmail').value
    ).toLowerCase();
    var password = (byId('fireSCreatePassword') && byId('fireSCreatePassword').value) || '';
    if (!email || !password) {
      setStatus('Enter email and a new password.', true);
      return;
    }
    if (password.length < 6) {
      setStatus('Password must be at least 6 characters.', true);
      return;
    }
    var sb = getSb();
    if (!sb || !sb.auth) {
      setStatus('Cloud is not ready yet. Wait a moment and try again.', true);
      return;
    }
    setStatus('Creating your login…');
    markJoiningAsStaff();
    try {
      var res = await sb.auth.signUp({ email: email, password: password });
      if (res.error) {
        var low = text(res.error.message).toLowerCase();
        var already =
          low.indexOf('already registered') >= 0 ||
          low.indexOf('already been registered') >= 0 ||
          low.indexOf('user already exists') >= 0 ||
          low.indexOf('email address is already') >= 0;
        if (already) {
          setStatus('This email already exists. Trying Login with that password…');
          var loginTry = await sb.auth.signInWithPassword({
            email: email,
            password: password
          });
          if (!loginTry.error) {
            await finishSignedInSession('Signed in with existing login.');
            return;
          }
          // Prefill login form and guide to Forgot password
          try {
            var loginEmail = byId('fireSLoginEmail');
            if (loginEmail) loginEmail.value = email;
          } catch (_) {}
          showLogin();
          setStatus(
            'This email already has a login, but that password is wrong. Use Forgot password, then Login. Do not delete and re-create the person for this.',
            true
          );
          return;
        }
        throw res.error;
      }
      if (!res.data || !res.data.session) {
        setStatus('Check your email to confirm, then use Login.', false);
        return;
      }
      await finishSignedInSession('Login created.');
    } catch (e) {
      setStatus(authErrorMessage(e), true);
    }
  }

  function isAlreadyRegisteredError(err) {
    var low = text(err && (err.message || err.error_description || err)).toLowerCase();
    return (
      low.indexOf('already registered') >= 0 ||
      low.indexOf('already been registered') >= 0 ||
      low.indexOf('user already exists') >= 0 ||
      low.indexOf('email address is already') >= 0
    );
  }

  async function createCompanyAfterSignIn(company, email, intervalPickerId, intervalOverride) {
    var sb = getSb();
    if (!sb || !sb.rpc) throw new Error('Cloud is not ready yet. Wait a moment and try again.');
    setStatus('Creating company…');
    var planId = 'standard';
    var intervalId = intervalOverride || chosenInterval(intervalPickerId) || 'monthly';
    var rpc = await sb.rpc('fire_s_create_company', {
      p_name: company,
      p_plan: planId
    });
    if (rpc.error) {
      rpc = await sb.rpc('fire_s_create_company', { p_name: company });
    }
    if (rpc.error) throw rpc.error;
    var companyRow = parseCompanyRpc(rpc, company);
    if (companyRow) rememberCompany(companyRow.name || company, companyRow.id);
    await refreshMembership();
    rememberCompany(company, (profile() && profile().companyId) || (companyRow && companyRow.id));
    await saveChosenPlan(planId, intervalId);
    notifySubscribe(company, email, intervalId);
    clearPendingSubscribe();
    setStatus('Subscribed. Opening Personnel…');
    mode = 'login';
    refreshHomeChrome();
    setTimeout(openPersonnelAfterCreate, 200);
  }

  async function finishPendingSubscribeIfAny() {
    if (hasCompany()) {
      clearPendingSubscribe();
      return false;
    }
    var pending = readPendingSubscribe();
    if (!pending || !text(pending.company)) return false;
    if (isJoiningAsStaff()) return false;
    try {
      await createCompanyAfterSignIn(
        text(pending.company),
        text(pending.email),
        null,
        text(pending.interval) || 'monthly'
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  async function signInAfterSignUp(email, password) {
    var sb = getSb();
    if (!sb || !sb.auth) return null;
    var loginTry = await sb.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (loginTry.error) return null;
    return loginTry;
  }

  async function doRegisterCompany() {
    var company = text(byId('fireSGetStartedCompany') && byId('fireSGetStartedCompany').value);
    var email = text(byId('fireSGetStartedEmail') && byId('fireSGetStartedEmail').value).toLowerCase();
    var password = (byId('fireSGetStartedPassword') && byId('fireSGetStartedPassword').value) || '';
    if (!company) {
      setStatus('Enter a company name.', true);
      return;
    }
    if (!email || !password) {
      setStatus('Enter your owner email and password.', true);
      return;
    }
    if (password.length < 6) {
      setStatus('Password must be at least 6 characters.', true);
      return;
    }
    if (!agreedToLegal('fireSRegisterAgree')) {
      setStatus('Tick the box to agree to the Terms and the Privacy policy.', true);
      return;
    }
    var sb = getSb();
    if (!sb || !sb.auth) {
      setStatus('Cloud is not ready yet. Wait a moment and try again.', true);
      return;
    }
    var intervalId = chosenInterval('fireSRegisterBillingOptions');
    savePendingSubscribe(company, email, intervalId);
    setStatus('Creating owner account…');
    try {
      var redirectTo = accessRedirectUrl();
      var signUpOpts = redirectTo ? { emailRedirectTo: redirectTo } : undefined;
      var up = await sb.auth.signUp(
        signUpOpts
          ? { email: email, password: password, options: signUpOpts }
          : { email: email, password: password }
      );
      if (up.error && isAlreadyRegisteredError(up.error)) {
        setStatus('This email already has a login. Signing in to finish Subscribe…');
        var existing = await signInAfterSignUp(email, password);
        if (!existing) {
          try {
            var loginEmail = byId('fireSLoginEmail');
            if (loginEmail) loginEmail.value = email;
          } catch (_) {}
          showLogin();
          setStatus(
            'This email already has a login, but that password is wrong. Use Forgot password, then Login.',
            true
          );
          return;
        }
        await refreshMembership();
        if (hasCompany()) {
          clearPendingSubscribe();
          await finishSignedInSession('Signed in with existing login.');
          return;
        }
        await createCompanyAfterSignIn(company, email, 'fireSRegisterBillingOptions', intervalId);
        return;
      }
      if (up.error) throw up.error;
      if (!up.data || !up.data.session) {
        setStatus('Finishing Subscribe…');
        var signedIn = await signInAfterSignUp(email, password);
        if (!signedIn) {
          if (isStagingEnv()) {
            setStatus('Subscribe is not finished yet. Tap Subscribe once more.', true);
          } else {
            setStatus('Check your email to confirm, then Login and finish company setup.', false);
          }
          return;
        }
      }
      await refreshMembership();
      if (hasCompany()) {
        clearPendingSubscribe();
        await finishSignedInSession('Subscribed.');
        return;
      }
      await createCompanyAfterSignIn(company, email, 'fireSRegisterBillingOptions', intervalId);
    } catch (e) {
      setStatus(authErrorMessage(e), true);
    }
  }

  async function doFinishCompanyOnly() {
    var company = text(
      byId('fireSGetStartedCompanyOnlyName') && byId('fireSGetStartedCompanyOnlyName').value
    );
    if (!company) {
      setStatus('Enter a company name.', true);
      return;
    }
    if (!agreedToLegal('fireSCompanyOnlyAgree')) {
      setStatus('Tick the box to agree to the Terms and the Privacy policy.', true);
      return;
    }
    try {
      await createCompanyAfterSignIn(
        company,
        profile() && profile().email,
        'fireSCompanyOnlyBillingOptions'
      );
    } catch (e) {
      setStatus((e && e.message) || 'Could not create company.', true);
    }
  }

  async function doCheckAgain() {
    setStatus('Joining the company…');
    try {
      var claimed = await joinCompanyAfterLogin();
      refreshHomeChrome();
      if (claimed > 0 || hasCompany()) {
        clearJoiningAsStaff();
        await syncCloudAfterAuth();
        enterAppHome(claimed > 0 ? 'You are on the team.' : 'Access updated.');
        return;
      }
      setStatus(
        lastJoinError ||
          'Still not in the company. Ask your owner: People → Add inspector / manager → this same email. Then tap Check again.',
        true
      );
      showWaiting();
    } catch (e) {
      setStatus((e && e.message) || 'Could not refresh access.', true);
    }
  }

  function openAccess(preferredMode) {
    try {
      if (typeof window.showHome === 'function') window.showHome();
    } catch (_) {}
    closeCloudPanels();
    if (preferredMode === 'login') mode = 'login';
    else if (preferredMode === 'create') mode = 'create';
    else if (preferredMode === 'register') mode = 'register';
    else if (preferredMode === 'choices') mode = 'login';
    else mode = 'login';
    render();
    try {
      if (root) {
        root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (_) {}
    setTimeout(function () {
      var focusId =
        mode === 'login'
          ? 'fireSLoginEmail'
          : mode === 'create'
            ? 'fireSCreateEmail'
            : mode === 'register'
              ? 'fireSGetStartedCompany'
              : mode === 'company'
                ? 'fireSGetStartedCompanyOnlyName'
                : null;
      var field = focusId && byId(focusId);
      if (field) field.focus();
    }, 120);
  }

  var accessServiceName = '';

  function accessServiceEls() {
    return {
      wrap: byId('fireSAccessExtraServices'),
      toggle: byId('fireSAccessExtraServicesBtn'),
      panel: byId('fireSAccessExtraServicesPanel'),
      form: byId('fireSAccessServiceForm'),
      picked: byId('fireSAccessServicePicked'),
      name: byId('fireSAccessServiceName'),
      phone: byId('fireSAccessServicePhone'),
      email: byId('fireSAccessServiceEmail'),
      message: byId('fireSAccessServiceMessage'),
      status: byId('fireSAccessServiceStatus')
    };
  }

  function setAccessServiceStatus(msg, isError) {
    var els = accessServiceEls();
    if (!els.status) return;
    els.status.textContent = msg || '';
    els.status.className =
      'fire-s-get-started-note fire-s-access-service-status' +
      (isError ? ' is-error' : '');
  }

  function isAccessServicesOpen() {
    var els = accessServiceEls();
    return !!(els.wrap && els.wrap.classList.contains('is-open'));
  }

  function setAccessServicesOpen(open) {
    var els = accessServiceEls();
    if (!els.wrap || !els.toggle || !els.panel) return;
    els.wrap.classList.toggle('is-open', !!open);
    els.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      els.panel.removeAttribute('hidden');
    } else {
      els.panel.setAttribute('hidden', '');
      hideAccessServiceForm();
    }
  }

  function hideAccessServiceForm() {
    var els = accessServiceEls();
    accessServiceName = '';
    if (els.form) els.form.setAttribute('hidden', '');
    if (els.picked) els.picked.textContent = '';
    setAccessServiceStatus('', false);
    try {
      root.querySelectorAll('[data-access-service]').forEach(function (btn) {
        btn.classList.remove('is-selected');
      });
    } catch (_) {}
  }

  function pickAccessService(name, button) {
    var els = accessServiceEls();
    accessServiceName = text(name);
    if (!els.form) return;
    els.form.removeAttribute('hidden');
    if (els.picked) {
      els.picked.textContent = 'Request: ' + accessServiceName;
    }
    setAccessServiceStatus('', false);
    try {
      root.querySelectorAll('[data-access-service]').forEach(function (btn) {
        btn.classList.toggle('is-selected', btn === button);
      });
    } catch (_) {}
    if (els.name) els.name.focus();
  }

  function sendAccessServiceRequest() {
    var els = accessServiceEls();
    var name = text(els.name && els.name.value);
    var phone = text(els.phone && els.phone.value);
    var email = text(els.email && els.email.value).toLowerCase();
    var message = text(els.message && els.message.value);
    if (!accessServiceName) {
      setAccessServiceStatus('Tap a service first.', true);
      return;
    }
    if (!name || (!phone && !email)) {
      setAccessServiceStatus(
        'Type your name and a phone number or email.',
        true
      );
      return;
    }
    setAccessServiceStatus('Sending request…', false);
    var notify = window.fireSNotifyServiceRequest;
    var done = function (result) {
      if (result && result.skipped === 'staging') {
        setAccessServiceStatus(
          'Request noted on the toets-blad. Live Access emails Fire-S.',
          false
        );
        return;
      }
      setAccessServiceStatus('Request sent. Fire-S will contact you.', false);
      if (els.name) els.name.value = '';
      if (els.phone) els.phone.value = '';
      if (els.email) els.email.value = '';
      if (els.message) els.message.value = '';
    };
    if (typeof notify !== 'function') {
      done({ ok: true });
      return;
    }
    Promise.resolve(
      notify({
        service: accessServiceName,
        name: name,
        phone: phone,
        email: email,
        message: message
      })
    )
      .then(done)
      .catch(function () {
        setAccessServiceStatus(
          'Could not send now. Try again or email johandb@live.com.',
          true
        );
      });
  }

  function wireAccessExtraServices() {
    var els = accessServiceEls();
    if (!els.toggle || !els.panel) return;
    els.toggle.addEventListener('click', function () {
      setAccessServicesOpen(!isAccessServicesOpen());
    });
    root.querySelectorAll('[data-access-service]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pickAccessService(btn.getAttribute('data-access-service'), btn);
      });
    });
    var sendBtn = byId('fireSAccessServiceSendBtn');
    var cancelBtn = byId('fireSAccessServiceCancelBtn');
    if (sendBtn) sendBtn.addEventListener('click', sendAccessServiceRequest);
    if (cancelBtn) {
      cancelBtn.addEventListener('click', hideAccessServiceForm);
    }
  }

  var deferredInstall = null;

  function installHelp() {
    setStatus(
      'On this phone: Chrome menu (three dots) → Add to Home screen / Install app. Google Play listing comes next, after Fire-S uploads the store file.',
      false
    );
  }

  async function tryInstallApp() {
    if (deferredInstall) {
      try {
        deferredInstall.prompt();
        var choice = await deferredInstall.userChoice;
        deferredInstall = null;
        if (choice && choice.outcome === 'accepted') {
          setStatus('Fire-S is on this phone.');
          return;
        }
      } catch (_) {}
    }
    installHelp();
  }

  function wire() {
    if (wired || !ensureEls()) return;
    wired = true;

    var loginChoice = byId('fireSChoiceLogin');
    var createChoice = byId('fireSChoiceCreate');
    var companyChoice = byId('fireSChoiceCompany');
    if (loginChoice) loginChoice.addEventListener('click', showLogin);
    if (createChoice) createChoice.addEventListener('click', showCreatePassword);
    if (companyChoice) companyChoice.addEventListener('click', showRegister);

    root.querySelectorAll('[data-fire-s-back]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showLogin();
      });
    });
    var registerLogin = byId('fireSRegisterSwitchToLoginBtn');
    if (registerLogin) {
      registerLogin.addEventListener('click', showLogin);
    }
    var loginSubscribe = byId('fireSLoginSubscribeBtn');
    if (loginSubscribe) {
      loginSubscribe.addEventListener('click', function (event) {
        try {
          if (event) event.preventDefault();
        } catch (_) {}
        showRegister();
      });
    }

    var switchCreate = byId('fireSSwitchToCreateBtn');
    if (switchCreate) {
      switchCreate.addEventListener('click', showCreatePassword);
    }
    var switchLogin = byId('fireSSwitchToLoginBtn');
    if (switchLogin) {
      switchLogin.addEventListener('click', showLogin);
    }

    var doLoginBtn = byId('fireSDoLoginBtn');
    var doCreateBtn = byId('fireSDoCreateBtn');
    var doResetBtn = byId('fireSDoResetBtn');
    var resetBackBtn = byId('fireSResetBackBtn');
    var registerBtn = byId('fireSGetStartedCreateBtn');
    var finishBtn = byId('fireSGetStartedFinishBtn');
    var checkBtn = byId('fireSWaitingCheckBtn');
    if (doLoginBtn) doLoginBtn.addEventListener('click', doLogin);
    if (doCreateBtn) doCreateBtn.addEventListener('click', doCreatePassword);
    if (doResetBtn) doResetBtn.addEventListener('click', doSaveNewPassword);
    if (resetBackBtn) {
      resetBackBtn.addEventListener('click', function () {
        leaveReset();
      });
    }
    var forgotLoginBtn = byId('fireSForgotPasswordBtn');
    var forgotCreateBtn = byId('fireSForgotFromCreateBtn');
    if (forgotLoginBtn) {
      forgotLoginBtn.addEventListener('click', function () {
        doForgotPassword(false);
      });
    }
    if (forgotCreateBtn) {
      forgotCreateBtn.addEventListener('click', function () {
        doForgotPassword(true);
      });
    }
    if (registerBtn) registerBtn.addEventListener('click', doRegisterCompany);
    if (finishBtn) finishBtn.addEventListener('click', doFinishCompanyOnly);
    if (checkBtn) checkBtn.addEventListener('click', doCheckAgain);
    var startCompanyBtn = byId('fireSWaitingStartCompanyBtn');
    if (startCompanyBtn) {
      startCompanyBtn.addEventListener('click', showCompanyOnly);
    }

    var installBtn = byId('fireSInstallAppBtn');
    if (installBtn) {
      installBtn.addEventListener('click', function () {
        tryInstallApp();
      });
    }
    var loginInstallBtn = byId('fireSLoginInstallBtn');
    if (loginInstallBtn) {
      loginInstallBtn.addEventListener('click', function () {
        tryInstallApp();
      });
    }

    wireAccessExtraServices();

    var openAccessBtn = byId('cloudOpenAccessBtn');
    if (openAccessBtn) {
      openAccessBtn.addEventListener('click', function () {
        openAccess('login');
      });
    }
  }

  function boot() {
    wire();
    render();
  }

  window.refreshFireSGetStarted = function () {
    wire();
    render();
  };
  window.fireSSyncGetStarted = window.refreshFireSGetStarted;
  window.fireSOpenAccess = openAccess;
  window.fireSClaimInvitesQuiet = claimInvitesQuiet;
  window.fireSGetStartedPhoneBack = function fireSGetStartedPhoneBack() {
    if (!root || !shouldShowAccess()) return false;
    if (mode === 'reset' || isPasswordRecovery()) {
      leaveReset();
      return true;
    }
    if (mode === 'login' || mode === 'company') return false;
    showLogin();
    return true;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('fire-s:password-recovery', function () {
    markPasswordRecovery();
    if (!ensureEls()) return;
    showAccess();
    showResetPassword();
  });
  document.addEventListener('fire-s:auth-changed', function () {
    if (isPasswordRecovery()) {
      showAccess();
      showResetPassword();
      return;
    }
    if (mode === 'login' || mode === 'create' || mode === 'register' || mode === 'reset') {
      // keep current form while user is mid-flow unless access should hide
      if (!shouldShowAccess()) {
        mode = 'login';
        render();
      }
      return;
    }
    mode = 'login';
    render();
  });
  window.addEventListener('beforeinstallprompt', function (event) {
    try {
      event.preventDefault();
    } catch (_) {}
    deferredInstall = event;
  });
  setTimeout(boot, 400);
  setTimeout(boot, 1200);
})();
