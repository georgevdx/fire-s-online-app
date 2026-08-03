/* Fire-S Get Started — clear Login / Join / Start company */
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

  function hideAllForms() {
    [
      'fireSGetStartedChoices',
      'fireSGetStartedLoginFields',
      'fireSGetStartedJoinFields',
      'fireSGetStartedGuestFields',
      'fireSGetStartedCompanyOnly'
    ].forEach(id => {
      const el = byId(id);
      if (el) el.style.display = 'none';
    });
  }

  function showStep(step) {
    const root = byId('fireSGetStarted');
    const title = byId('fireSGetStartedTitle');
    const help = byId('fireSGetStartedHelp');
    if (!root) return;

    hideAllForms();
    setStatus('');

    if (!step) {
      root.style.display = 'none';
      return;
    }

    root.style.display = 'block';

    if (step === 'choices') {
      const choices = byId('fireSGetStartedChoices');
      if (choices) choices.style.display = 'grid';
      if (title) title.textContent = 'How do you want to start?';
      if (help) help.textContent = 'Choose one option below.';
      return;
    }

    if (step === 'login') {
      const box = byId('fireSGetStartedLoginFields');
      if (box) box.style.display = 'grid';
      if (title) title.textContent = 'Login';
      if (help) help.textContent = 'Use your own email and password.';
      return;
    }

    if (step === 'join') {
      const box = byId('fireSGetStartedJoinFields');
      if (box) box.style.display = 'grid';
      if (title) title.textContent = 'Create your login';
      if (help) help.textContent = 'For Inspectors and Managers joining a company.';
      return;
    }

    if (step === 'company') {
      const box = byId('fireSGetStartedGuestFields');
      if (box) box.style.display = 'grid';
      if (title) title.textContent = 'Start your company';
      if (help) help.textContent = 'Company name + your email + password.';
      return;
    }

    if (step === 'company-only') {
      const box = byId('fireSGetStartedCompanyOnly');
      if (box) box.style.display = 'grid';
      if (title) title.textContent = 'Name your company';
      if (help) help.textContent = 'One step left.';
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
        byId('fireSGetStarted').style.display = 'block';
        showStep('choices');
        return;
      }
      if ((newCompany || (isSignedIn() && !hasCompany())) && isSignedIn()) {
        byId('fireSGetStarted').style.display = 'block';
        showStep('company-only');
        return;
      }
      showStep(null);
    } catch (_) {
      showStep(null);
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

  async function afterAuthSuccess(message) {
    try {
      if (typeof window.loadUserAccessProfile === 'function') {
        await window.loadUserAccessProfile();
      }
    } catch (_) {}
    try {
      if (typeof window.fireSApplyCleanHomeRoles === 'function') {
        window.fireSApplyCleanHomeRoles();
      }
    } catch (_) {}
    try {
      if (typeof window.fireSSyncGetStarted === 'function') {
        window.fireSSyncGetStarted();
      }
    } catch (_) {}
    if (message) setStatus(message, false);
  }

  async function doLogin() {
    const email = text(byId('fireSLoginEmail')?.value).toLowerCase();
    const password = String(byId('fireSLoginPassword')?.value || '');
    const btn = byId('fireSDoLoginBtn');
    if (!email || !password) {
      setStatus('Enter your email and password.', true);
      return;
    }
    if (btn) btn.disabled = true;
    setStatus('Signing in…');
    try {
      const { error } = await waitFor(
        supabaseClient.auth.signInWithPassword({ email, password }),
        10000,
        'Login'
      );
      if (error) throw error;
      await afterAuthSuccess('Signed in.');
      try {
        if (typeof window.showHome === 'function') window.showHome();
      } catch (_) {}
    } catch (error) {
      setStatus(error.message || 'Login failed. Check email and password.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function doJoinSignup() {
    const email = text(byId('fireSJoinEmail')?.value).toLowerCase();
    const password = String(byId('fireSJoinPassword')?.value || '');
    const btn = byId('fireSDoJoinBtn');
    if (!email || !email.includes('@')) {
      setStatus('Enter your own email.', true);
      return;
    }
    if (password.length < 6) {
      setStatus('Password must be at least 6 characters.', true);
      return;
    }
    if (btn) btn.disabled = true;
    setStatus('Creating your login…');
    try {
      const { data, error } = await waitFor(
        supabaseClient.auth.signUp({ email, password }),
        10000,
        'Sign up'
      );
      if (error) throw error;

      if (!data?.session) {
        const login = await waitFor(
          supabaseClient.auth.signInWithPassword({ email, password }),
          8000,
          'Login'
        );
        if (login.error) {
          setStatus(
            'Login created. If asked, confirm your email, then use Login.',
            false
          );
          return;
        }
      }

      await afterAuthSuccess(
        'Your login is ready. Ask your owner to add your email in Company → Team.'
      );
      try {
        if (typeof window.showHome === 'function') window.showHome();
      } catch (_) {}
    } catch (error) {
      setStatus(error.message || 'Could not create login. Try again.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function createCompanyForCurrentUser(companyName) {
    const name = text(companyName) || 'My Fire-S Company';
    const rpc = await waitFor(
      supabaseClient.rpc('fire_s_create_company', { p_name: name }),
      8000,
      'Create company'
    );
    if (rpc.error) throw rpc.error;
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    const id = row?.company_id || row?.out_company_id || row?.id;
    if (!id) throw new Error('Could not create company. Please try again.');
    const company = {
      id,
      name: row.company_name || row.out_company_name || row.name || name
    };
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
    const companyName = text(byId('fireSGetStartedCompany')?.value);
    const email = text(byId('fireSGetStartedEmail')?.value).toLowerCase();
    const password = String(byId('fireSGetStartedPassword')?.value || '');
    const btn = byId('fireSGetStartedCreateBtn');

    if (!companyName) {
      setStatus('Please enter your company name.', true);
      return;
    }
    if (!email || !email.includes('@')) {
      setStatus('Please enter your own email.', true);
      return;
    }
    if (password.length < 6) {
      setStatus('Password must be at least 6 characters.', true);
      return;
    }

    if (btn) btn.disabled = true;
    setStatus('Creating your account…');
    try {
      const { data, error } = await waitFor(
        supabaseClient.auth.signUp({ email, password }),
        10000,
        'Sign up'
      );
      if (error) throw error;

      if (!data?.session) {
        const login = await waitFor(
          supabaseClient.auth.signInWithPassword({ email, password }),
          8000,
          'Login'
        );
        if (login.error) {
          setStatus(
            'Account created. Confirm email if asked, then Login and finish setup.',
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
      await afterAuthSuccess(`“${company.name}” is ready.`);
      try {
        if (typeof window.fireSOpenCompanyTeam === 'function') {
          window.fireSOpenCompanyTeam();
        }
      } catch (_) {}
    } catch (error) {
      setStatus(error.message || 'Could not create your company.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function finishCompanyOnly() {
    const companyName = text(byId('fireSGetStartedCompanyOnlyName')?.value);
    const btn = byId('fireSGetStartedFinishBtn');
    if (!companyName) {
      setStatus('Please enter your company name.', true);
      return;
    }
    if (btn) btn.disabled = true;
    setStatus('Saving your company…');
    try {
      const company = await createCompanyForCurrentUser(companyName);
      await afterAuthSuccess(`“${company.name}” is ready.`);
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

  function bind() {
    const map = [
      ['fireSChoiceLogin', () => showStep('login')],
      ['fireSChoiceJoin', () => showStep('join')],
      ['fireSChoiceCompany', () => showStep('company')],
      ['fireSDoLoginBtn', doLogin],
      ['fireSDoJoinBtn', doJoinSignup],
      ['fireSGetStartedCreateBtn', createMyCompany],
      ['fireSGetStartedFinishBtn', finishCompanyOnly]
    ];
    map.forEach(([id, fn]) => {
      const el = byId(id);
      if (el && !el.__fireSBound) {
        el.__fireSBound = true;
        el.addEventListener('click', fn);
      }
    });

    document.querySelectorAll('[data-fire-s-back]').forEach(btn => {
      if (btn.__fireSBound) return;
      btn.__fireSBound = true;
      btn.addEventListener('click', () => showStep('choices'));
    });
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
  setTimeout(init, 400);
  setTimeout(syncVisibility, 1000);
})();
