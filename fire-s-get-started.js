/**
 * First-day setup: Login OR Register company.
 * Inspectors use Login (or create password once) — invites are claimed automatically.
 */
(function fireSGetStartedInit() {
  'use strict';

  var root = null;
  var choicesEl = null;
  var loginFields = null;
  var guestFields = null;
  var companyOnly = null;
  var statusEl = null;
  var titleEl = null;
  var helpEl = null;
  var wired = false;
  var mode = 'choices';

  function qs(id) {
    return document.getElementById(id);
  }

  function ensureEls() {
    root = qs('fireSGetStarted');
    choicesEl = qs('fireSGetStartedChoices');
    loginFields = qs('fireSGetStartedLoginFields');
    guestFields = qs('fireSGetStartedGuestFields');
    companyOnly = qs('fireSGetStartedCompanyOnly');
    statusEl = qs('fireSGetStartedStatus');
    titleEl = qs('fireSGetStartedTitle');
    helpEl = qs('fireSGetStartedHelp');
    return !!root;
  }

  function setStatus(msg, isError) {
    if (!statusEl) return;
    if (!msg) {
      statusEl.style.display = 'none';
      statusEl.textContent = '';
      statusEl.className = 'fire-s-get-started-status';
      return;
    }
    statusEl.style.display = 'block';
    statusEl.textContent = String(msg);
    statusEl.className = 'fire-s-get-started-status' + (isError ? ' error' : '');
  }

  function hideAllPanels() {
    if (choicesEl) choicesEl.style.display = 'none';
    if (loginFields) loginFields.style.display = 'none';
    if (guestFields) guestFields.style.display = 'none';
    if (companyOnly) companyOnly.style.display = 'none';
  }

  function showChoices() {
    mode = 'choices';
    hideAllPanels();
    if (choicesEl) choicesEl.style.display = '';
    if (titleEl) titleEl.textContent = 'How do you want to start?';
    if (helpEl) helpEl.textContent = 'Choose one option below.';
    setStatus('');
  }

  function showLogin() {
    mode = 'login';
    hideAllPanels();
    if (loginFields) loginFields.style.display = '';
    if (titleEl) titleEl.textContent = 'Login';
    if (helpEl) helpEl.textContent = 'Owners and staff use the same login screen.';
    setStatus('');
  }

  function showRegisterCompany() {
    mode = 'register';
    hideAllPanels();
    if (guestFields) guestFields.style.display = '';
    if (titleEl) titleEl.textContent = 'Register your company';
    if (helpEl) helpEl.textContent = 'You become the Owner. Next you manage personnel.';
    setStatus('');
  }

  function showCompanyOnly() {
    mode = 'company_only';
    hideAllPanels();
    if (companyOnly) companyOnly.style.display = '';
    if (titleEl) titleEl.textContent = 'Almost ready';
    if (helpEl) {
      helpEl.textContent =
        'Owners register the company here. Staff wait until the owner adds their email.';
    }
    setStatus('');
  }

  function getSb() {
    try {
      if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient) {
        return window.supabaseClient;
      }
    } catch (e) {}
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    } catch (e2) {}
    return window.sb || null;
  }

  function getSessionUser() {
    try {
      var p = window.currentUserProfile;
      if (p && p.id && p.id !== 'local-user') {
        return { id: p.id, email: p.email || '' };
      }
    } catch (e) {}
    try {
      var u = window.FireSAuth && window.FireSAuth.user;
      if (u && u.id) return u;
    } catch (e2) {}
    return null;
  }

  function hasCompany() {
    try {
      if (window.currentUserProfile && window.currentUserProfile.companyId) return true;
    } catch (e) {}
    try {
      return !!(window.FireSAuth && window.FireSAuth.companyId);
    } catch (e2) {
      return false;
    }
  }

  function shouldShow() {
    var user = getSessionUser();
    if (!user) return true;
    return !hasCompany();
  }

  async function claimInvitesQuiet() {
    try {
      var sb = getSb();
      if (!sb || !sb.rpc) return 0;
      var res = await sb.rpc('fire_s_claim_my_invites');
      if (res.error) return 0;
      if (Array.isArray(res.data)) return res.data.length;
      return res.data ? 1 : 0;
    } catch (e) {
      return 0;
    }
  }

  async function refreshMembership() {
    try {
      if (typeof window.loadUserAccessProfile === 'function') {
        await window.loadUserAccessProfile();
        return;
      }
    } catch (e) {}
    try {
      if (typeof loadUserAccessProfile === 'function') {
        await loadUserAccessProfile();
        return;
      }
    } catch (e2) {}
    try {
      if (window.FireSAuth && typeof window.FireSAuth.refreshMembership === 'function') {
        await window.FireSAuth.refreshMembership();
        return;
      }
    } catch (e3) {}
    try {
      if (typeof window.refreshCloudStatus === 'function') await window.refreshCloudStatus();
    } catch (e4) {}
  }

  function openTeamAfterCreate() {
    try {
      if (typeof window.openCompanyTeamOverlay === 'function') {
        window.openCompanyTeamOverlay({ afterCreate: true });
        return;
      }
    } catch (e) {}
    try {
      var btn = document.getElementById('companyTeamBtn');
      if (btn) btn.click();
    } catch (e2) {}
  }

  function refreshHome() {
    try {
      if (typeof window.refreshCleanHomeRoles === 'function') window.refreshCleanHomeRoles();
    } catch (e) {}
    try {
      if (typeof window.refreshCloudStatus === 'function') window.refreshCloudStatus();
    } catch (e2) {}
    try {
      document.dispatchEvent(new CustomEvent('fire-s:auth-changed'));
    } catch (e3) {}
  }

  function render() {
    if (!ensureEls()) return;
    if (!shouldShow()) {
      root.style.display = 'none';
      return;
    }
    root.style.display = '';
    var user = getSessionUser();
    if (user && !hasCompany()) {
      showCompanyOnly();
      return;
    }
    if (mode === 'login') showLogin();
    else if (mode === 'register') showRegisterCompany();
    else if (mode === 'company_only') showCompanyOnly();
    else showChoices();
  }

  async function doLogin() {
    var email = (qs('fireSLoginEmail') && qs('fireSLoginEmail').value || '').trim().toLowerCase();
    var password = (qs('fireSLoginPassword') && qs('fireSLoginPassword').value) || '';
    if (!email || !password) {
      setStatus('Enter email and password.', true);
      return;
    }
    var sb = getSb();
    if (!sb || !sb.auth) {
      setStatus('Cloud is not ready yet. Wait a moment.', true);
      return;
    }
    setStatus('Signing in…');
    try {
      var res = await sb.auth.signInWithPassword({ email: email, password: password });
      if (res.error) throw res.error;
      var claimed = await claimInvitesQuiet();
      await refreshMembership();
      if (claimed > 0) setStatus('Welcome — you are on the company team.');
      else setStatus('Signed in.');
      mode = 'choices';
      refreshHome();
      render();
    } catch (e) {
      setStatus((e && e.message) || 'Login failed.', true);
    }
  }

  async function doCreatePassword() {
    var email = (qs('fireSLoginEmail') && qs('fireSLoginEmail').value || '').trim().toLowerCase();
    var password = (qs('fireSLoginPassword') && qs('fireSLoginPassword').value) || '';
    if (!email || !password) {
      setStatus('Enter email and a password to create.', true);
      return;
    }
    if (password.length < 6) {
      setStatus('Password must be at least 6 characters.', true);
      return;
    }
    var sb = getSb();
    if (!sb || !sb.auth) {
      setStatus('Cloud is not ready yet. Wait a moment.', true);
      return;
    }
    setStatus('Creating your login…');
    try {
      var res = await sb.auth.signUp({ email: email, password: password });
      if (res.error) throw res.error;
      if (!res.data || !res.data.session) {
        setStatus('Check your email to confirm, then login.', false);
        return;
      }
      var claimed = await claimInvitesQuiet();
      await refreshMembership();
      if (claimed > 0) setStatus('You are on the team. Opening Home…');
      else setStatus('Login created. Ask your owner to add your email if needed.');
      mode = 'choices';
      refreshHome();
      render();
    } catch (e) {
      setStatus((e && e.message) || 'Could not create login.', true);
    }
  }

  async function doRegisterCompany() {
    var company = (qs('fireSGetStartedCompany') && qs('fireSGetStartedCompany').value || '').trim();
    var email = (qs('fireSGetStartedEmail') && qs('fireSGetStartedEmail').value || '').trim().toLowerCase();
    var password = (qs('fireSGetStartedPassword') && qs('fireSGetStartedPassword').value) || '';
    if (!company) {
      setStatus('Enter a company name.', true);
      return;
    }
    if (!email || !password) {
      setStatus('Enter your email and password.', true);
      return;
    }
    if (password.length < 6) {
      setStatus('Password must be at least 6 characters.', true);
      return;
    }
    var sb = getSb();
    if (!sb || !sb.auth) {
      setStatus('Cloud is not ready yet. Wait a moment.', true);
      return;
    }
    setStatus('Creating account…');
    try {
      var up = await sb.auth.signUp({ email: email, password: password });
      if (up.error) throw up.error;
      if (!up.data || !up.data.session) {
        setStatus('Check your email to confirm, then login and finish setup.', false);
        return;
      }
      setStatus('Creating company…');
      var rpc = await sb.rpc('fire_s_create_company', { p_name: company });
      if (rpc.error) throw rpc.error;
      await refreshMembership();
      setStatus('Company ready — manage personnel next.');
      mode = 'choices';
      refreshHome();
      render();
      setTimeout(openTeamAfterCreate, 250);
    } catch (e) {
      setStatus((e && e.message) || 'Could not register company.', true);
    }
  }

  async function doFinishCompanyOnly() {
    var company = (qs('fireSGetStartedCompanyOnlyName') && qs('fireSGetStartedCompanyOnlyName').value || '').trim();
    if (!company) {
      setStatus('Enter a company name.', true);
      return;
    }
    var sb = getSb();
    if (!sb || !sb.rpc) {
      setStatus('Cloud is not ready yet. Wait a moment.', true);
      return;
    }
    setStatus('Creating company…');
    try {
      var rpc = await sb.rpc('fire_s_create_company', { p_name: company });
      if (rpc.error) throw rpc.error;
      await refreshMembership();
      setStatus('Company ready — manage personnel next.');
      mode = 'choices';
      refreshHome();
      render();
      setTimeout(openTeamAfterCreate, 250);
    } catch (e) {
      setStatus((e && e.message) || 'Could not create company.', true);
    }
  }

  function wire() {
    if (wired || !ensureEls()) return;
    wired = true;
    var loginBtn = qs('fireSChoiceLogin');
    var companyBtn = qs('fireSChoiceCompany');
    if (loginBtn) loginBtn.addEventListener('click', showLogin);
    if (companyBtn) companyBtn.addEventListener('click', showRegisterCompany);
    root.querySelectorAll('[data-fire-s-back]').forEach(function (btn) {
      btn.addEventListener('click', showChoices);
    });
    var doLoginBtn = qs('fireSDoLoginBtn');
    var doJoinBtn = qs('fireSDoJoinBtn');
    var createBtn = qs('fireSGetStartedCreateBtn');
    var finishBtn = qs('fireSGetStartedFinishBtn');
    if (doLoginBtn) doLoginBtn.addEventListener('click', doLogin);
    if (doJoinBtn) doJoinBtn.addEventListener('click', doCreatePassword);
    if (createBtn) createBtn.addEventListener('click', doRegisterCompany);
    if (finishBtn) finishBtn.addEventListener('click', doFinishCompanyOnly);
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
  window.fireSClaimInvitesQuiet = claimInvitesQuiet;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  document.addEventListener('fire-s:auth-changed', function () {
    mode = 'choices';
    render();
  });
  setTimeout(boot, 400);
  setTimeout(boot, 1200);
})();
