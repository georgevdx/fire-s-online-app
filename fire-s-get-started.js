/**
 * Fire-S Access Gate (from-scratch)
 * ---------------------------------
 * ONE place for login / create password / register company.
 * Cloud menu no longer owns auth for normal users.
 *
 * Modes:
 *   choices   → pick a path
 *   login     → returning users
 *   create    → invited staff, first time
 *   register  → new business owner
 *   company   → signed in, still need company name
 *   waiting   → signed in, waiting for owner invite
 */
(function fireSAccessGate() {
  'use strict';

  var mode = 'choices';
  var wired = false;
  var root = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
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

  function canRegisterCompany() {
    if (isFreshCompanyStart()) return true;
    if (hasCompany()) return false;
    var role = homeRole();
    if (
      role === 'owner' ||
      role === 'company_owner' ||
      role === 'manager' ||
      role === 'inspector' ||
      role === 'super_admin' ||
      role === 'viewer' ||
      role === 'pending_member'
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

  function hidePanels() {
    [
      'fireSGetStartedChoices',
      'fireSGetStartedLoginFields',
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
    if (root) root.style.display = 'none';
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

  async function claimInvitesQuiet() {
    try {
      var sb = getSb();
      if (!sb || !sb.rpc) return 0;
      var res = await sb.rpc('fire_s_claim_my_invites');
      if (res.error) return 0;
      if (Array.isArray(res.data)) return res.data.length;
      return res.data ? 1 : 0;
    } catch (_) {
      return 0;
    }
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

  function showChoices() {
    mode = 'choices';
    hidePanels();
    setTitle(
      'Access',
      'Choose one path. Staff and owners use the same Access screen.'
    );
    showPanel('fireSGetStartedChoices');
    var registerBtn = byId('fireSChoiceCompany');
    var allow = canRegisterCompany();
    if (registerBtn) {
      registerBtn.style.display = allow ? '' : 'none';
      registerBtn.hidden = !allow;
    }
    setStatus('');
  }

  function showLogin() {
    mode = 'login';
    hidePanels();
    setTitle('Login', 'Owners and staff use the same login.');
    showPanel('fireSGetStartedLoginFields');
    var createToggle = byId('fireSSwitchToCreateBtn');
    if (createToggle) createToggle.style.display = '';
    setStatus('');
  }

  function showCreatePassword() {
    mode = 'create';
    hidePanels();
    setTitle(
      'Create password',
      'Use the email your owner added under Personnel. This is only needed once.'
    );
    showPanel('fireSGetStartedCreateFields');
    setStatus('');
  }

  function showRegister() {
    if (!canRegisterCompany()) {
      setStatus('Your company is already registered. Use Login.', true);
      showLogin();
      return;
    }
    mode = 'register';
    hidePanels();
    setTitle(
      'Register company',
      'You become the Owner. Next you manage personnel.'
    );
    showPanel('fireSGetStartedGuestFields');
    setStatus('');
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
      'You are signed in. Save the company name once, then manage personnel.'
    );
    showPanel('fireSGetStartedCompanyOnly');
    setStatus('');
  }

  function showWaiting() {
    mode = 'waiting';
    hidePanels();
    setTitle(
      'Almost ready',
      'Your login works. Ask your owner to add your email under Personnel, then tap Check again.'
    );
    showPanel('fireSGetStartedWaiting');
    setStatus('');
  }

  function shouldShowAccess() {
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

    if (mode === 'login') showLogin();
    else if (mode === 'create') showCreatePassword();
    else if (mode === 'register') showRegister();
    else if (mode === 'company') showCompanyOnly();
    else if (mode === 'waiting') showWaiting();
    else showChoices();
  }

  function authErrorMessage(err) {
    var msg = text(err && (err.message || err.error_description || err));
    var low = msg.toLowerCase();
    if (low.indexOf('invalid login') >= 0 || low.indexOf('invalid credentials') >= 0) {
      return 'Wrong password for that email. Try again, or use Forgot password. Do not use Create password again if this email already exists.';
    }
    if (
      low.indexOf('already registered') >= 0 ||
      low.indexOf('already been registered') >= 0 ||
      low.indexOf('user already exists') >= 0 ||
      low.indexOf('email address is already') >= 0
    ) {
      return 'This email already has a login. Use Login, or Forgot password if the password is unknown.';
    }
    return msg || 'Something went wrong.';
  }

  async function finishSignedInSession(successMsg) {
    var claimed = await claimInvitesQuiet();
    await refreshMembership();
    mode = 'choices';
    refreshHomeChrome();
    if (claimed > 0 || hasCompany()) {
      await syncCloudAfterAuth();
      enterAppHome(
        successMsg || (claimed > 0 ? 'You are on the team.' : 'Signed in.')
      );
      return;
    }
    if (canRegisterCompany()) {
      setStatus('Signed in. Register your company name next.');
      showCompanyOnly();
      return;
    }
    showWaiting();
    setStatus('Signed in. Waiting for your owner to add you.');
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
      var redirectTo = '';
      try {
        redirectTo = String(window.location.origin || '') + '/';
      } catch (_) {}
      var opts = redirectTo ? { redirectTo: redirectTo } : undefined;
      var res = await sb.auth.resetPasswordForEmail(email, opts);
      if (res.error) throw res.error;
      setStatus(
        'Check the inbox for ' +
          email +
          '. Open the reset link, choose a new password, then use Login.'
      );
    } catch (e) {
      setStatus(authErrorMessage(e), true);
    }
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
    var sb = getSb();
    if (!sb || !sb.auth) {
      setStatus('Cloud is not ready yet. Wait a moment and try again.', true);
      return;
    }
    setStatus('Creating owner account…');
    try {
      var up = await sb.auth.signUp({ email: email, password: password });
      if (up.error) throw up.error;
      if (!up.data || !up.data.session) {
        setStatus('Check your email to confirm, then Login and finish company setup.', false);
        return;
      }
      setStatus('Creating company…');
      var rpc = await sb.rpc('fire_s_create_company', { p_name: company });
      if (rpc.error) throw rpc.error;
      var companyRow = parseCompanyRpc(rpc, company);
      if (companyRow) rememberCompany(companyRow.name || company, companyRow.id);
      await refreshMembership();
      rememberCompany(company, (profile() && profile().companyId) || (companyRow && companyRow.id));
      setStatus('Company ready. Opening Personnel…');
      mode = 'choices';
      refreshHomeChrome();
      setTimeout(openPersonnelAfterCreate, 200);
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
    var sb = getSb();
    if (!sb || !sb.rpc) {
      setStatus('Cloud is not ready yet. Wait a moment and try again.', true);
      return;
    }
    setStatus('Creating company…');
    try {
      var rpc = await sb.rpc('fire_s_create_company', { p_name: company });
      if (rpc.error) throw rpc.error;
      var companyRow = parseCompanyRpc(rpc, company);
      if (companyRow) rememberCompany(companyRow.name || company, companyRow.id);
      await refreshMembership();
      rememberCompany(company, (profile() && profile().companyId) || (companyRow && companyRow.id));
      setStatus('Company ready. Opening Personnel…');
      mode = 'choices';
      refreshHomeChrome();
      setTimeout(openPersonnelAfterCreate, 200);
    } catch (e) {
      setStatus((e && e.message) || 'Could not create company.', true);
    }
  }

  async function doCheckAgain() {
    setStatus('Checking access…');
    try {
      var claimed = await claimInvitesQuiet();
      await refreshMembership();
      refreshHomeChrome();
      if (claimed > 0 || hasCompany()) {
        await syncCloudAfterAuth();
        enterAppHome(claimed > 0 ? 'You are on the team.' : 'Access updated.');
        return;
      }
      setStatus('Still waiting. Ask your owner to add your email under Personnel.', true);
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
    else mode = 'choices';
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
      btn.addEventListener('click', showChoices);
    });

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
    var registerBtn = byId('fireSGetStartedCreateBtn');
    var finishBtn = byId('fireSGetStartedFinishBtn');
    var checkBtn = byId('fireSWaitingCheckBtn');
    if (doLoginBtn) doLoginBtn.addEventListener('click', doLogin);
    if (doCreateBtn) doCreateBtn.addEventListener('click', doCreatePassword);
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

    var openAccessBtn = byId('cloudOpenAccessBtn');
    if (openAccessBtn) {
      openAccessBtn.addEventListener('click', function () {
        openAccess('choices');
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('fire-s:auth-changed', function () {
    if (mode === 'login' || mode === 'create' || mode === 'register') {
      // keep current form while user is mid-flow unless access should hide
      if (!shouldShowAccess()) {
        mode = 'choices';
        render();
      }
      return;
    }
    mode = 'choices';
    render();
  });
  setTimeout(boot, 400);
  setTimeout(boot, 1200);
})();
