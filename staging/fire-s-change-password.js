/* ============================================================
   Fire-S Change password
   Owner sets a temporary password when adding a staff email.
   After Login, that person chooses and confirms their own password.
   Inspector, Manager, Owner and Viewer can also change it from Home.
   ============================================================ */
(function fireSChangePassword() {
  'use strict';

  var required = false;
  var wired = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function getSb() {
    try {
      if (window.supabaseClient) return window.supabaseClient;
    } catch (_) {}
    return null;
  }

  function hideEl(el) {
    if (!el) return;
    el.hidden = true;
    try {
      el.setAttribute('aria-hidden', 'true');
    } catch (_) {}
    if (el.style && typeof el.style.setProperty === 'function') {
      el.style.setProperty('display', 'none', 'important');
    } else if (el.style) {
      el.style.display = 'none';
    }
  }

  function showEl(el, display) {
    if (!el) return;
    el.hidden = false;
    try {
      el.removeAttribute('hidden');
    } catch (_) {}
    try {
      el.removeAttribute('aria-hidden');
    } catch (_) {}
    if (el.style && typeof el.style.setProperty === 'function') {
      el.style.setProperty('display', display || 'block', 'important');
    } else if (el.style) {
      el.style.display = display || 'block';
    }
  }

  function hideOtherSections() {
    [
      'homeSection',
      'fireSHomeLockPanel',
      'servicesSection',
      'projectListSection',
      'projectFormSection',
      'findingsCentreSection',
      'companyTeamSection',
      'companyLetterheadSection',
      'testSamplesSection',
      'inspectorBoardSection',
      'userManualSection',
      'managementDashboardSection',
      'fireSSubscribeSection',
      'reportSection'
    ].forEach(function (id) {
      hideEl(byId(id));
    });
  }

  function setMessage(message, isError) {
    var el = byId('fireSChangePasswordMessage');
    if (!el) return;
    if (!message) {
      el.style.display = 'none';
      el.textContent = '';
      el.classList.remove('is-error');
      return;
    }
    el.style.display = 'block';
    el.textContent = message;
    if (isError) el.classList.add('is-error');
    else el.classList.remove('is-error');
  }

  function readMustChangeFromUser(user) {
    try {
      var meta = (user && (user.user_metadata || user.raw_user_meta_data)) || {};
      if (meta.must_change_password === true || meta.must_change_password === 'true') {
        return true;
      }
    } catch (_) {}
    try {
      if (window.currentUserProfile && window.currentUserProfile.mustChangePassword) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  async function sessionMustChange() {
    try {
      if (window.currentUserProfile && window.currentUserProfile.mustChangePassword) {
        return true;
      }
    } catch (_) {}
    var sb = getSb();
    if (!sb || !sb.auth || typeof sb.auth.getUser !== 'function') return false;
    try {
      var res = await sb.auth.getUser();
      return readMustChangeFromUser(res && res.data && res.data.user);
    } catch (_) {
      return false;
    }
  }

  function paintRequired() {
    var note = byId('fireSChangePasswordNote');
    var title = byId('fireSChangePasswordTitle');
    var back = byId('fireSChangePasswordBackBtn');
    var heading = byId('fireSChangePasswordHeading');
    if (title) {
      title.textContent = required
        ? 'Choose your own password'
        : 'Change password';
    }
    if (heading) heading.textContent = required ? 'New password' : 'Change password';
    if (note) {
      note.textContent = required
        ? 'Your owner gave you a temporary password so you could Login. Type a new password twice to confirm. You stay signed in.'
        : 'Type a new password twice to confirm. Inspector, Manager, Owner and Viewer can all change their own password here.';
    }
    if (back) {
      back.style.display = required ? 'none' : '';
      back.hidden = !!required;
    }
  }

  function openChangePassword(opts) {
    required = !!(opts && opts.required);
    hideOtherSections();
    var section = byId('fireSChangePasswordSection');
    showEl(section, 'block');
    paintRequired();
    setMessage(
      required
        ? 'Type a new password twice, then tap Save password.'
        : ''
    );
    var first = byId('fireSChangePassword');
    var second = byId('fireSChangePassword2');
    if (first) first.value = '';
    if (second) second.value = '';
    try {
      if (first) first.focus();
    } catch (_) {}
    try {
      if (typeof window.updateFloatingBackButton === 'function') {
        window.updateFloatingBackButton();
      }
    } catch (_) {}
  }

  function goHome() {
    if (required) {
      setMessage('Choose your own password first. Type it twice, then tap Save password.', true);
      return true;
    }
    hideEl(byId('fireSChangePasswordSection'));
    showEl(byId('homeSection'), 'block');
    try {
      if (typeof window.showHome === 'function') window.showHome();
    } catch (_) {}
    return true;
  }

  async function maybeForceChangePassword() {
    var must = false;
    try {
      must = await sessionMustChange();
    } catch (_) {
      must = false;
    }
    if (!must) return false;
    openChangePassword({ required: true });
    return true;
  }

  async function savePassword() {
    var password = (byId('fireSChangePassword') && byId('fireSChangePassword').value) || '';
    var again = (byId('fireSChangePassword2') && byId('fireSChangePassword2').value) || '';
    if (!password || !again) {
      setMessage('Type the new password twice.', true);
      return;
    }
    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.', true);
      return;
    }
    if (password !== again) {
      setMessage('The two passwords do not match.', true);
      return;
    }
    var sb = getSb();
    if (!sb || !sb.auth) {
      setMessage('Cloud is not ready yet. Wait a moment and try again.', true);
      return;
    }
    var saveBtn = byId('fireSChangePasswordSaveBtn');
    if (saveBtn) saveBtn.disabled = true;
    setMessage('Saving password…');
    try {
      var res = await sb.auth.updateUser({
        password: password,
        data: { must_change_password: false }
      });
      if (res.error) throw res.error;
      try {
        await sb.rpc('fire_s_clear_must_change_password');
      } catch (_) {}
      try {
        if (window.currentUserProfile) {
          window.currentUserProfile.mustChangePassword = false;
        }
      } catch (_) {}
      required = false;
      try {
        byId('fireSChangePassword').value = '';
        byId('fireSChangePassword2').value = '';
      } catch (_) {}
      hideEl(byId('fireSChangePasswordSection'));
      showEl(byId('homeSection'), 'block');
      try {
        if (typeof window.showHome === 'function') window.showHome();
      } catch (_) {}
      setMessage('');
      try {
        if (typeof window.fireSSetSubscribeMessage === 'function') {
          window.fireSSetSubscribeMessage('Password saved.');
        }
      } catch (_) {}
    } catch (err) {
      var msg = text(err && (err.message || err.error_description)) || 'Could not save that password.';
      setMessage(msg, true);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function wire() {
    if (wired) return;
    wired = true;
    var btn = byId('cmdChangePasswordBtn');
    var save = byId('fireSChangePasswordSaveBtn');
    var back = byId('fireSChangePasswordBackBtn');
    if (btn) {
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        openChangePassword({ required: false });
      });
    }
    if (save) save.addEventListener('click', savePassword);
    if (back) {
      back.addEventListener('click', function () {
        goHome();
      });
    }
  }

  function boot() {
    wire();
    maybeForceChangePassword();
  }

  window.fireSOpenChangePassword = openChangePassword;
  window.fireSMaybeForceChangePassword = maybeForceChangePassword;
  window.fireSChangePasswordGoBack = goHome;
  window.fireSUserMustChangePassword = readMustChangeFromUser;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('fire-s:auth-changed', function () {
    maybeForceChangePassword();
  });
})();
