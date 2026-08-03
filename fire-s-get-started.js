/* Fire-S simple Get Started — one screen for new companies */
(function fireSGetStarted() {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value || '').trim();
  }

  function setStatus(message, isError) {
    const el = byId('fireSGetStartedStatus');
    if (!el) return;
    if (!message) {
      el.style.display = 'none';
      el.textContent = '';
      el.classList.remove('is-error');
      return;
    }
    el.style.display = 'block';
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
  }

  function isSignedIn() {
    try {
      const id = window.currentUserProfile?.id;
      return !!(id && id !== 'local-user');
    } catch (_) {
      return false;
    }
  }

  function hasCompany() {
    try {
      return !!window.currentUserProfile?.companyId;
    } catch (_) {
      return false;
    }
  }

  function showPanel(mode) {
    const root = byId('fireSGetStarted');
    const guest = byId('fireSGetStartedGuestFields');
    const only = byId('fireSGetStartedCompanyOnly');
    const title = byId('fireSGetStartedTitle');
    const help = byId('fireSGetStartedHelp');
    if (!root) return;

    if (!mode) {
      root.style.display = 'none';
      return;
    }

    root.style.display = 'block';
    if (guest) guest.style.display = mode === 'guest' ? 'grid' : 'none';
    if (only) only.style.display = mode === 'company' ? 'grid' : 'none';

    if (mode === 'guest') {
      if (title) title.textContent = 'Start your Fire-S company';
      if (help) {
        help.textContent =
          'Company name + your email + password. Nothing else.';
      }
    } else {
      if (title) title.textContent = 'Name your company';
      if (help) {
        help.textContent = 'You are signed in. One step left.';
      }
    }
  }

  function syncVisibility() {
    try {
      const bodyRole = document.body?.dataset?.fireSCleanHomeRole || '';
      const guestLike =
        document.body?.classList?.contains('fire-s-role-guest') ||
        bodyRole === 'guest';
      const newCompany =
        document.body?.classList?.contains('fire-s-role-new-company') ||
        bodyRole === 'new_company';

      if (guestLike && !isSignedIn()) {
        showPanel('guest');
        return;
      }
      if ((newCompany || (isSignedIn() && !hasCompany())) && isSignedIn()) {
        showPanel('company');
        return;
      }
      showPanel(null);
    } catch (_) {
      showPanel(null);
    }
  }

  async function waitFor(promise, ms, label) {
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error((label || 'Request') + ' took too long. Try again.')),
          ms || 8000
        )
      )
    ]);
  }

  async function createCompanyForCurrentUser(companyName) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      throw new Error('Cloud is not ready. Check your internet and try again.');
    }

    const name = text(companyName) || 'My Fire-S Company';
    let company = null;

    const rpc = await waitFor(
      supabaseClient.rpc('fire_s_create_company', { p_name: name }),
      8000,
      'Create company'
    );

    if (!rpc.error && rpc.data) {
      const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      const id = row?.company_id || row?.out_company_id || row?.id;
      if (id) {
        company = {
          id,
          name: row.company_name || row.out_company_name || row.name || name
        };
      }
    }

    if (!company?.id) {
      throw new Error(
        (rpc.error && rpc.error.message) ||
          'Could not create company. Please try again.'
      );
    }

    try {
      if (typeof window.loadUserAccessProfile === 'function') {
        await window.loadUserAccessProfile();
      }
    } catch (_) {}

    window.currentUserProfile = {
      ...(window.currentUserProfile || {}),
      role: 'company_owner',
      companyId: company.id,
      companyName: company.name
    };

    return company;
  }

  async function createMyCompany() {
    const companyInput = byId('fireSGetStartedCompany');
    const emailInput = byId('fireSGetStartedEmail');
    const passwordInput = byId('fireSGetStartedPassword');
    const btn = byId('fireSGetStartedCreateBtn');

    const companyName = text(companyInput?.value);
    const email = text(emailInput?.value).toLowerCase();
    const password = String(passwordInput?.value || '');

    if (!companyName) {
      setStatus('Please enter your company name.', true);
      companyInput?.focus();
      return;
    }
    if (!email || !email.includes('@')) {
      setStatus('Please enter your own email.', true);
      emailInput?.focus();
      return;
    }
    if (password.length < 6) {
      setStatus('Password must be at least 6 characters.', true);
      passwordInput?.focus();
      return;
    }

    if (btn) btn.disabled = true;
    setStatus('Creating your account…');

    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient?.auth) {
        throw new Error('Cloud is not ready. Check your internet and try again.');
      }

      const { data, error } = await waitFor(
        supabaseClient.auth.signUp({ email, password }),
        10000,
        'Sign up'
      );
      if (error) throw error;

      if (!data?.session && !data?.user) {
        setStatus(
          'Account created. Check your email to confirm, then login and finish setup.',
          false
        );
        return;
      }

      // Prefer immediate session; otherwise try login.
      if (!data.session) {
        const login = await waitFor(
          supabaseClient.auth.signInWithPassword({ email, password }),
          8000,
          'Login'
        );
        if (login.error) {
          setStatus(
            'Account created. Please confirm your email, then login to finish.',
            false
          );
          return;
        }
      }

      try {
        if (typeof window.loadUserAccessProfile === 'function') {
          await window.loadUserAccessProfile();
        }
      } catch (_) {}

      setStatus('Setting up your company…');
      const company = await createCompanyForCurrentUser(companyName);

      setStatus(`“${company.name}” is ready. You can add your team next.`);
      try {
        if (typeof window.fireSApplyCleanHomeRoles === 'function') {
          window.fireSApplyCleanHomeRoles();
        }
      } catch (_) {}
      try {
        if (typeof window.fireSOpenCompanyTeam === 'function') {
          window.fireSOpenCompanyTeam();
        }
      } catch (_) {}
    } catch (error) {
      console.error('Get started failed:', error);
      setStatus(error.message || 'Could not create your company. Please try again.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function finishCompanyOnly() {
    const input = byId('fireSGetStartedCompanyOnlyName');
    const btn = byId('fireSGetStartedFinishBtn');
    const companyName = text(input?.value);
    if (!companyName) {
      setStatus('Please enter your company name.', true);
      input?.focus();
      return;
    }
    if (btn) btn.disabled = true;
    setStatus('Saving your company…');
    try {
      const company = await createCompanyForCurrentUser(companyName);
      setStatus(`“${company.name}” is ready.`);
      try {
        if (typeof window.fireSApplyCleanHomeRoles === 'function') {
          window.fireSApplyCleanHomeRoles();
        }
      } catch (_) {}
      try {
        if (typeof window.fireSOpenCompanyTeam === 'function') {
          window.fireSOpenCompanyTeam();
        }
      } catch (_) {}
    } catch (error) {
      setStatus(error.message || 'Could not save company.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function openLogin() {
    const cloud = byId('cloudMenuBtn');
    if (cloud) cloud.click();
    setTimeout(() => {
      byId('loginEmail')?.focus();
    }, 200);
  }

  function bind() {
    const createBtn = byId('fireSGetStartedCreateBtn');
    if (createBtn && !createBtn.__fireSBound) {
      createBtn.__fireSBound = true;
      createBtn.addEventListener('click', createMyCompany);
    }
    const finishBtn = byId('fireSGetStartedFinishBtn');
    if (finishBtn && !finishBtn.__fireSBound) {
      finishBtn.__fireSBound = true;
      finishBtn.addEventListener('click', finishCompanyOnly);
    }
    const loginBtn = byId('fireSGetStartedLoginBtn');
    if (loginBtn && !loginBtn.__fireSBound) {
      loginBtn.__fireSBound = true;
      loginBtn.addEventListener('click', openLogin);
    }
  }

  function init() {
    bind();
    syncVisibility();
  }

  window.fireSSyncGetStarted = syncVisibility;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
  setTimeout(init, 500);
  setTimeout(syncVisibility, 1200);
})();
