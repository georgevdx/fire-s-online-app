/* ============================================================
   Fire-S Company Team / Personnel
   Load AFTER app.js.
   Purpose:
   - After a company exists, show its name prominently
   - Manage personnel: add, change roles, remove
   - Create-company UI only when no company is linked yet
   ============================================================ */
(function fireSCompanyTeamModule() {
  'use strict';

  const ROLES = [
    { value: 'inspector', label: 'Inspector' },
    { value: 'manager', label: 'Manager' },
    { value: 'company_owner', label: 'Owner' }
  ];
  const FRESH_MODE_KEY = 'fireS.forceNewCompanySetup';
  const ROLE_PREF_KEY = 'fireS.viewAsRole.v131';
  const COMPANY_CACHE_KEY = 'fireS.cachedCompany';
  let lastSeatEmails = [];
  let lastMembers = [];

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value || '').trim();
  }

  function isGenericCompanyName(name) {
    const n = text(name).toLowerCase();
    return (
      !n ||
      n === 'your company' ||
      n === 'your new company' ||
      n === 'local workspace' ||
      n === 'local / personal workspace'
    );
  }

  function rememberSeatEmails(members, invites) {
    const emails = [];
    (members || []).forEach(member => {
      const status = text(member.status || 'active').toLowerCase();
      if (status === 'inactive') return;
      const email = text(member.profiles && member.profiles.email).toLowerCase();
      if (email) emails.push(email);
    });
    (invites || []).forEach(invite => {
      const email = text(invite.email).toLowerCase();
      if (email) emails.push(email);
    });
    lastSeatEmails = emails;
    lastMembers = Array.isArray(members) ? members : [];
  }

  function ownerBillingEmail() {
    const members = lastMembers || [];
    for (let i = 0; i < members.length; i += 1) {
      const member = members[i];
      const status = text((member && member.status) || 'active').toLowerCase();
      if (status === 'inactive') continue;
      const role = text(member && member.role).toLowerCase();
      if (role !== 'company_owner' && role !== 'owner' && role !== 'super_admin') {
        continue;
      }
      const email = text(member && member.profiles && member.profiles.email).toLowerCase();
      if (email) return email;
    }
    return text(companyContext().email).toLowerCase();
  }

  function currentBillingInterval() {
    try {
      if (
        window.fireSSubscriptionCatalog &&
        window.fireSSubscriptionCatalog.currentIntervalId
      ) {
        return window.fireSSubscriptionCatalog.currentIntervalId() || 'monthly';
      }
    } catch (_) {}
    return 'monthly';
  }

  function notifyOwnerPaysSubscription(personEmail, roleName) {
    try {
      if (typeof window.fireSNotifyCompanyS !== 'function') return;
      const ctx = companyContext();
      window.fireSNotifyCompanyS({
        kind: 'seat',
        company: text(ctx.companyName || window.currentUserProfile?.companyName),
        email: text(personEmail).toLowerCase(),
        role: roleName,
        billedTo: ownerBillingEmail(),
        interval: currentBillingInterval()
      });
    } catch (_) {}
  }

  function duplicateSeatMessage(email) {
    try {
      if (window.fireSSubscriptionCatalog && window.fireSSubscriptionCatalog.duplicateSeatMessage) {
        return window.fireSSubscriptionCatalog.duplicateSeatMessage(email);
      }
    } catch (_) {}
    return (
      text(email).toLowerCase() +
      ' is already a subscription the owner pays for. That person logs in on phone and desktop with the same email. Do not enter it again.'
    );
  }

  function otherCompanySeatMessage(email) {
    return (
      text(email).toLowerCase() +
      ' already belongs to a company. One person is one company. They Login with that email.'
    );
  }

  function isOtherCompanySeatError(msg) {
    const low = text(msg).toLowerCase();
    return (
      low.indexOf('one person is one company') >= 0 ||
      low.indexOf('already belongs to a company') >= 0 ||
      low.indexOf('company_members_one_active_user') >= 0
    );
  }

  function isClosedInviteStatus(status) {
    const value = text(status).toLowerCase();
    return (
      value === 'cancelled' ||
      value === 'canceled' ||
      value === 'expired' ||
      value === 'declined' ||
      value === 'rejected'
    );
  }

  function forgetSeatEmail(email) {
    const addr = text(email).toLowerCase();
    lastSeatEmails = (lastSeatEmails || []).filter(item => item !== addr);
  }

  async function reopenCancelledInvite(companyId, email, role) {
    const result = await waitFor(
      supabaseClient
        .from('company_invites')
        .select('id, email, role, status')
        .eq('company_id', companyId)
        .ilike('email', text(email).toLowerCase()),
      3000,
      'Invite lookup'
    );
    if (result?.error) return { ok: false, error: result.error };
    const rows = Array.isArray(result?.data) ? result.data : [];
    const pending = rows.some(row => text(row.status).toLowerCase() === 'pending');
    if (pending) return { ok: false, reason: 'pending' };
    const closed = rows.find(row => isClosedInviteStatus(row.status));
    if (!closed) return { ok: false, reason: 'none' };
    const updated = await waitFor(
      supabaseClient
        .from('company_invites')
        .update({
          status: 'pending',
          role: role || closed.role || 'inspector'
        })
        .eq('id', closed.id),
      4000,
      'Reopen invite'
    );
    if (updated?.error) return { ok: false, error: updated.error };
    return { ok: true, kind: 'invite' };
  }

  async function finishAddedPerson(email, role, status, emailInput, roleSelect, notify) {
    if (emailInput) emailInput.value = '';
    if (roleSelect) roleSelect.value = 'inspector';
    if (status === 'invited' || status === 'reopened') {
      setMessage(
        `${email} is a new subscription (${roleLabel(role)}). Company S invoices the owner, not this person. They open Access → Create password once.`
      );
    } else {
      setMessage(
        `${email} is a new subscription (${roleLabel(role)}). Company S invoices the owner, not this person. They Login with that email on phone and desktop.`
      );
    }
    await refreshTeam();
    if (notify) notifyOwnerPaysSubscription(email, roleLabel(role));
    try {
      if (typeof window.fireSRefreshCompanyPersonnelStats === 'function') {
        window.fireSRefreshCompanyPersonnelStats();
      }
    } catch (_) {}
  }

  function rememberCompanyName(companyId, companyName) {
    const id = text(companyId);
    const name = text(companyName);
    if (!id || isGenericCompanyName(name)) return;
    try {
      localStorage.setItem(
        COMPANY_CACHE_KEY,
        JSON.stringify({ id, name })
      );
    } catch (_) {}
    try {
      if (typeof window.fireSApplyUserProfilePatch === 'function') {
        window.fireSApplyUserProfilePatch({
          companyId: id,
          companyName: name
        });
      } else if (window.currentUserProfile) {
        window.currentUserProfile.companyId = id;
        window.currentUserProfile.companyName = name;
      }
      if (window.currentCompanyAccess) {
        window.currentCompanyAccess.companyName = name;
      }
    } catch (_) {}
  }

  function applySharedProfile(patch) {
    try {
      if (typeof window.fireSApplyUserProfilePatch === 'function') {
        return window.fireSApplyUserProfilePatch(patch);
      }
    } catch (_) {}
    window.currentUserProfile = {
      ...(window.currentUserProfile || {}),
      ...(patch || {})
    };
    return window.currentUserProfile;
  }

  function recalledCompanyName(companyId) {
    try {
      const raw = localStorage.getItem(COMPANY_CACHE_KEY);
      const cached = raw ? JSON.parse(raw) : null;
      const name = text(cached?.name);
      if (
        name &&
        !isGenericCompanyName(name) &&
        (!companyId || text(cached?.id) === text(companyId))
      ) {
        return name;
      }
    } catch (_) {}
    return '';
  }

  function esc(value) {
    return text(value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  }

  function roleLabel(role) {
    if (role === 'new_company') return 'New Company';
    const found = ROLES.find(item => item.value === role);
    return found ? found.label : role || 'Inspector';
  }

  function isFreshCompanyMode() {
    // Fresh/test company mode is Super Admin only — never for real owners.
    if (actualMembershipRole() !== 'super_admin') {
      try {
        localStorage.removeItem(FRESH_MODE_KEY);
      } catch (_) {}
      return false;
    }
    try {
      if (localStorage.getItem(FRESH_MODE_KEY) === '1') return true;
    } catch (_) {}
    try {
      if (typeof window.fireSViewAsRole131 === 'function') {
        return text(window.fireSViewAsRole131()).toLowerCase() === 'new_company';
      }
    } catch (_) {}
    try {
      return text(localStorage.getItem(ROLE_PREF_KEY)).toLowerCase() === 'new_company';
    } catch (_) {}
    return false;
  }

  function setFreshCompanyMode(on) {
    try {
      if (on) localStorage.setItem(FRESH_MODE_KEY, '1');
      else localStorage.removeItem(FRESH_MODE_KEY);
    } catch (_) {}
    try {
      if (on) localStorage.setItem(ROLE_PREF_KEY, 'new_company');
      else if (text(localStorage.getItem(ROLE_PREF_KEY)).toLowerCase() === 'new_company') {
        localStorage.setItem(ROLE_PREF_KEY, 'company_owner');
      }
    } catch (_) {}
    try {
      const select = byId('fireSRoleTestSelect');
      if (select && [...select.options].some(o => o.value === 'new_company')) {
        select.value = on ? 'new_company' : 'company_owner';
      }
    } catch (_) {}
    try {
      if (typeof window.fireSApplyCleanHomeRoles === 'function') {
        window.fireSApplyCleanHomeRoles();
      }
    } catch (_) {}
  }

  function updateFreshBanner() {
    const banner = byId('companyTeamFreshBanner');
    if (banner) banner.style.display = isFreshCompanyMode() ? 'flex' : 'none';
  }

  function updateStartFreshButton(hasCompany) {
    const wrap = byId('companyTeamStartFreshWrap');
    if (!wrap) return;
    const realRole = text(window.currentUserProfile?.role).toLowerCase();
    // Keep this test-only control away from normal subscribers.
    const canStart = !!hasCompany && realRole === 'super_admin' && !isFreshCompanyMode();
    wrap.style.display = canStart ? '' : 'none';
  }

  function updateDangerControls() {
    const clearBtn = byId('companyTeamClearOthersBtn');
    const realRole = text(window.currentUserProfile?.role).toLowerCase();
    const allowDanger = realRole === 'super_admin';
    if (clearBtn) {
      clearBtn.style.display = allowDanger ? '' : 'none';
      clearBtn.hidden = !allowDanger;
    }
  }

  function actualMembershipRole() {
    return text(window.currentUserProfile?.role).toLowerCase();
  }

  function currentRole() {
    const actual = actualMembershipRole();
    // Role Test view-as only for real super admins — never for owners/managers.
    if (actual === 'super_admin') {
      try {
        if (typeof window.fireSViewAsRole131 === 'function') {
          const viewed = text(window.fireSViewAsRole131()).toLowerCase();
          if (viewed === 'new_company') return 'company_owner';
          if (viewed) return viewed;
        }
      } catch (_) {}
    }
    if (actual === 'new_company') return 'company_owner';
    return actual || 'inspector';
  }

  function canManageTeam() {
    if (isFreshCompanyMode() && actualMembershipRole() === 'super_admin') return true;
    const role = currentRole();
    return ['company_owner', 'super_admin', 'manager'].includes(role);
  }

  function canAssignOwner() {
    // Everyday Personnel: Inspector + Manager only. Owner assignment is rare/admin.
    return actualMembershipRole() === 'super_admin';
  }

  function setMessage(message, isError) {
    const el = byId('companyTeamMessage');
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

  function waitFor(promise, timeoutMs, label) {
    const ms = timeoutMs || 3500;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error((label || 'Request') + ' timed out. Check internet / Supabase.')),
          ms
        )
      )
    ]);
  }

  let cachedAuthUser = null;
  let cachedAuthAt = 0;

  async function requireUser() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient?.auth) {
      throw new Error('Cloud is not available on this device.');
    }

    // 1) Fast local profile already loaded by the app.
    const profile = window.currentUserProfile;
    if (profile?.id && profile.id !== 'local-user') {
      cachedAuthUser = {
        id: profile.id,
        email: profile.email || ''
      };
      cachedAuthAt = Date.now();
      return cachedAuthUser;
    }

    // 2) Reuse recent auth cache.
    if (cachedAuthUser && Date.now() - cachedAuthAt < 60000) {
      return cachedAuthUser;
    }

    // 3) Try local session quickly (should be near-instant).
    try {
      const sessionResult = await waitFor(
        supabaseClient.auth.getSession(),
        1500,
        'Session check'
      );
      const sessionUser = sessionResult?.data?.session?.user;
      if (sessionUser) {
        cachedAuthUser = sessionUser;
        cachedAuthAt = Date.now();
        return sessionUser;
      }
    } catch (_) {}

    // 4) Last resort network user check — short timeout.
    try {
      const result = await waitFor(supabaseClient.auth.getUser(), 2500, 'Login check');
      const user = result?.data?.user;
      if (user) {
        cachedAuthUser = user;
        cachedAuthAt = Date.now();
        return user;
      }
    } catch (_) {}

    // 5) If Cloud UI already shows connected, do not block Company Team.
    const cloudBtn = byId('cloudMenuBtn');
    const cloudLooksConnected =
      cloudBtn &&
      (cloudBtn.classList.contains('connected') ||
        /synced|connected/i.test(String(cloudBtn.textContent || '')));

    if (cloudLooksConnected && profile?.email) {
      cachedAuthUser = {
        id: profile.id || profile.email,
        email: profile.email
      };
      cachedAuthAt = Date.now();
      return cachedAuthUser;
    }

    throw new Error('Please login first (Cloud → Login), then open Company Team.');
  }

  function isRoleTestManagementView() {
    try {
      const actual =
        typeof window.fireSActualUserRole131 === 'function'
          ? text(window.fireSActualUserRole131()).toLowerCase()
          : '';
      if (actual !== 'super_admin') return false;
      const viewed = text(
        typeof window.fireSViewAsRole131 === 'function'
          ? window.fireSViewAsRole131()
          : localStorage.getItem('fireS.viewAsRole.v131')
      ).toLowerCase();
      return ['company_owner', 'owner', 'manager', 'management', 'super_admin'].includes(
        viewed
      );
    } catch (_) {
      return false;
    }
  }

  function companyContext() {
    const profile = window.currentUserProfile || {};
    if (isFreshCompanyMode()) {
      return {
        companyId: null,
        companyName: 'Your new company',
        email: profile.email || '',
        role: 'company_owner'
      };
    }
    const viewed = currentRole();
    const companyId = profile.companyId || null;
    const fromProfile = text(profile.companyName);
    const fromCache = recalledCompanyName(companyId);
    const companyName =
      (!isGenericCompanyName(fromProfile) ? fromProfile : '') ||
      fromCache ||
      fromProfile ||
      'Your company';
    return {
      companyId,
      companyName,
      email: profile.email || '',
      role:
        viewed === 'company_owner' || viewed === 'manager' || viewed === 'super_admin'
          ? viewed
          : profile.role || viewed
    };
  }

  async function fetchCompanyName(companyId) {
    if (!companyId) return recalledCompanyName(companyId);
    const cached = recalledCompanyName(companyId);
    try {
      // Prefer SECURITY DEFINER RPC when available (avoids companies RLS misses).
      try {
        const rpc = await waitFor(
          supabaseClient.rpc('fire_s_my_company'),
          2500,
          'My company'
        );
        if (!rpc?.error && rpc?.data) {
          const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
          const name = text(
            row?.out_company_name || row?.company_name || row?.name
          );
          const id = text(
            row?.out_company_id || row?.company_id || row?.id || companyId
          );
          if (name && (!companyId || id === text(companyId) || !id)) {
            rememberCompanyName(companyId || id, name);
            return name;
          }
        }
      } catch (_) {}

      const result = await waitFor(
        supabaseClient
          .from('companies')
          .select('id, name')
          .eq('id', companyId)
          .maybeSingle(),
        2500,
        'Company name'
      );
      if (!result?.error) {
        const name = text(result?.data?.name);
        if (name) {
          rememberCompanyName(companyId, name);
          return name;
        }
      }

      // Fallback: membership embed
      const embed = await waitFor(
        supabaseClient
          .from('company_members')
          .select('company_id, companies(name)')
          .eq('company_id', companyId)
          .eq('user_id', window.currentUserProfile?.id || '')
          .eq('status', 'active')
          .limit(1)
          .maybeSingle(),
        2500,
        'Company embed'
      );
      const embedName = text(
        embed?.data?.companies?.name ||
          (Array.isArray(embed?.data?.companies)
            ? embed.data.companies[0]?.name
            : '')
      );
      if (embedName) {
        rememberCompanyName(companyId, embedName);
        return embedName;
      }
    } catch (_) {}
    return cached;
  }

  async function discoverCompanyForUser(userId) {
    try {
      if (typeof window.fireSLoadActiveCompanyMembership === 'function') {
        const picked = await window.fireSLoadActiveCompanyMembership(userId);
        if (picked?.company_id) {
          const knownName = text(window.currentUserProfile?.companyName);
          const companyName =
            (knownName && knownName !== 'Your company' ? knownName : '') ||
            (await fetchCompanyName(picked.company_id)) ||
            'Your company';
          const email = window.currentUserProfile?.email;
          const role =
            (typeof window.fireSCanonicalTeamRole === 'function'
              ? window.fireSCanonicalTeamRole(email, picked.role)
              : picked.role) || 'company_owner';
          return {
            companyId: picked.company_id,
            companyName,
            role
          };
        }
      }
    } catch (_) {}

    const basic = await waitFor(
      supabaseClient
        .from('company_members')
        .select('company_id, role, status, companies(name)')
        .eq('user_id', userId)
        .eq('status', 'active'),
      2000,
      'Company lookup'
    );

    if (basic?.error) throw basic.error;
    const rows = Array.isArray(basic?.data) ? basic.data : [];
    const row =
      typeof window.fireSPickPrimaryMembership === 'function'
        ? window.fireSPickPrimaryMembership(rows, {})
        : rows[0];
    if (!row?.company_id) return null;

    const knownName = text(window.currentUserProfile?.companyName);
    const embedded = row?.companies;
    const nested = Array.isArray(embedded) ? embedded[0] : embedded;
    const embeddedName = text(nested?.name);
    const companyName =
      (knownName && knownName !== 'Your company' ? knownName : '') ||
      embeddedName ||
      (await fetchCompanyName(row.company_id)) ||
      'Your company';
    const email = window.currentUserProfile?.email;
    const role =
      (typeof window.fireSCanonicalTeamRole === 'function'
        ? window.fireSCanonicalTeamRole(email, row.role)
        : row.role) || 'company_owner';

    return {
      companyId: row.company_id,
      companyName,
      role
    };
  }

  async function loadMembers(companyId) {
    const basic = await waitFor(
      supabaseClient
        .from('company_members')
        .select('id, user_id, role, status')
        .eq('company_id', companyId),
      3500,
      'Team list'
    );

    if (basic?.error) throw basic.error;

    const rows = Array.isArray(basic?.data) ? basic.data : [];
    if (!rows.length) return [];

    const ids = [...new Set(rows.map(row => row.user_id).filter(Boolean))];
    let profilesById = {};

    if (ids.length) {
      try {
        const profilesResult = await waitFor(
          supabaseClient
            .from('profiles')
            .select('id, email, full_name')
            .in('id', ids),
          3500,
          'Profiles'
        );
        const profiles = Array.isArray(profilesResult?.data) ? profilesResult.data : [];
        profilesById = Object.fromEntries(profiles.map(p => [p.id, p]));
      } catch (_) {
        profilesById = {};
      }
    }

    return rows.map(row => {
      const profile = profilesById[row.user_id] || null;
      const canonical =
        typeof window.fireSCanonicalTeamRole === 'function'
          ? window.fireSCanonicalTeamRole(profile?.email, row.role)
          : row.role;
      return {
        ...row,
        role: canonical || row.role,
        profiles: profile
      };
    });
  }

  function hideOtherSections() {
    [
      'homeSection',
      'servicesSection',
      'projectListSection',
      'projectFormSection',
      'findingsCentreSection',
      'testSamplesSection',
      'companyLetterheadSection',
      'userManualSection',
      'fireSSubscribeSection',
      'managementDashboardSection'
    ].forEach(id => {
      const el = byId(id);
      if (el) el.style.display = 'none';
    });
  }

  function showCompanyTeamSection() {
    hideOtherSections();
    const section = byId('companyTeamSection');
    if (section) section.style.display = 'block';
    try {
      if (typeof window.updateFloatingBackButton === 'function') {
        window.updateFloatingBackButton();
      }
    } catch (_) {}
  }

  function setLaterButtonVisible(visible) {
    const laterBtn = byId('companyTeamLaterBtn');
    if (laterBtn) laterBtn.style.display = visible ? '' : 'none';
  }

  function setPersonnelChrome(mode, companyName) {
    const intro = document.querySelector('#companyTeamSection .company-team-intro');
    const heading = byId('companyTeamHeading');
    const kicker = byId('companyTeamKicker');
    const title = byId('companyTeamTitle');
    const subtitle = byId('companyTeamSubtitle');
    const isSetup = mode === 'setup';
    const displayName = text(companyName);

    if (intro) {
      intro.classList.toggle('is-setup', isSetup);
      intro.classList.toggle(
        'has-company-name',
        !isSetup && !isGenericCompanyName(displayName)
      );
    }
    if (heading) heading.textContent = isSetup ? 'Company' : 'People';
    if (kicker) {
      kicker.textContent = isSetup
        ? 'First step'
        : isGenericCompanyName(displayName)
          ? 'Your company'
          : 'Your company';
    }
    if (title) {
      title.textContent = isSetup
        ? 'Name your company'
        : displayName || 'Your company';
    }
    if (subtitle) {
      subtitle.textContent = isSetup
        ? 'Save once. After that you only add people here.'
        : 'Add Inspectors and Managers. Change roles or remove people when needed.';
    }
    updateDangerControls();
  }

  function countMembersByRole(members) {
    const tallies = { inspector: 0, manager: 0, company_owner: 0 };
    members
      .filter(m => text(m.status || 'active').toLowerCase() !== 'inactive')
      .forEach(m => {
        const role = text(m.role).toLowerCase() || 'inspector';
        if (role === 'company_owner' || role === 'owner') tallies.company_owner += 1;
        else if (role === 'manager') tallies.manager += 1;
        else tallies.inspector += 1;
      });
    return tallies;
  }

  function renderMeta(ctx, members, pendingInvites) {
    const meta = byId('companyTeamMeta');
    const hasCompany = !!text(ctx.companyId) && !isFreshCompanyMode();
    setPersonnelChrome(hasCompany ? 'manage' : 'setup', ctx.companyName);
    if (!meta) return;
    if (!hasCompany) {
      meta.textContent = 'No company linked yet';
      return;
    }
    const activeMembers = members.filter(
      m => text(m.status || 'active').toLowerCase() !== 'inactive'
    );
    const pending = Array.isArray(pendingInvites) ? pendingInvites : [];
    const tallies = countMembersByRole(activeMembers);
    pending.forEach(invite => {
      const role = text(invite.role).toLowerCase() || 'inspector';
      if (role === 'company_owner' || role === 'owner') tallies.company_owner += 1;
      else if (role === 'manager') tallies.manager += 1;
      else tallies.inspector += 1;
    });
    const peopleTotal = activeMembers.length + pending.length;
    const nameBit = !isGenericCompanyName(ctx.companyName)
      ? `${ctx.companyName} · `
      : '';
    meta.textContent =
      `${nameBit}Inspectors (${tallies.inspector}) · Managers (${tallies.manager}) · Owner (${tallies.company_owner}) · People (${peopleTotal}) · Your role: ${roleLabel(ctx.role)}`;
    try {
      if (typeof window.fireSRefreshCompanyPersonnelStats === 'function') {
        window.fireSRefreshCompanyPersonnelStats();
      }
    } catch (_) {}
  }

  function refreshPersonnelChrome() {
    try {
      const section = byId('companyTeamSection');
      if (!section || section.style.display === 'none') return;
      const ctx = companyContext();
      const hasCompany = !!text(ctx.companyId) && !isFreshCompanyMode();
      setPersonnelChrome(hasCompany ? 'manage' : 'setup', ctx.companyName);
    } catch (_) {}
  }

  function roleOptionsHtml(selected, disabledOwner) {
    return ROLES.map(role => {
      const disabled =
        disabledOwner && role.value === 'company_owner' && selected !== 'company_owner'
          ? ' disabled'
          : '';
      const isSelected = selected === role.value ? ' selected' : '';
      return `<option value="${role.value}"${isSelected}${disabled}>${role.label}</option>`;
    }).join('');
  }

  async function loadPendingInvites(companyId) {
    try {
      const result = await waitFor(
        supabaseClient
          .from('company_invites')
          .select('id, email, role, status, created_at')
          .eq('company_id', companyId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        3000,
        'Pending invites'
      );
      if (result?.error) throw result.error;
      return Array.isArray(result?.data) ? result.data : [];
    } catch (_) {
      return [];
    }
  }

  function renderPendingInvites(invites) {
    const list = byId('companyTeamPendingList');
    if (!list) return;
    if (!invites.length) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML =
      '<div class="cloud-section-title" style="margin:0 0 8px;">Waiting to install / login</div>' +
      invites
        .map(invite => {
          const email = text(invite.email);
          const role = text(invite.role) || 'inspector';
          const id = text(invite.id);
          return `
          <article class="company-team-card" data-invite-id="${esc(id)}">
            <div class="company-team-card-main">
              <strong>${esc(email)}</strong>
              <span>Invited as ${esc(roleLabel(role))} · not logged in yet</span>
            </div>
            <div class="company-team-card-actions is-invite">
              <button type="button" class="secondary-btn" data-cancel-invite="${esc(id)}" data-invite-email="${esc(email)}">
                Cancel invite
              </button>
            </div>
          </article>`;
        })
        .join('');

    list.querySelectorAll('[data-cancel-invite]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await cancelInvite(
          btn.getAttribute('data-cancel-invite'),
          btn.getAttribute('data-invite-email')
        );
      });
    });
  }

  async function clearOtherPersonnel() {
    try {
      if (!canManageTeam()) {
        throw new Error('Only Manager or Owner can clear personnel.');
      }
      const ctx = companyContext();
      if (!ctx.companyId) throw new Error('No company linked yet.');

      const ok = window.confirm(
        'Remove all other people and pending invites?\n\nOnly your login stays. Then you can add fresh employees.'
      );
      if (!ok) return;

      setMessage('Clearing other people…');
      const me = text(window.currentUserProfile?.id);
      const members = await loadMembers(ctx.companyId);
      const invites = await loadPendingInvites(ctx.companyId);

      let removed = 0;
      let cancelled = 0;

      for (const invite of invites) {
        const id = text(invite.id);
        if (!id) continue;
        const { error } = await waitFor(
          supabaseClient
            .from('company_invites')
            .update({ status: 'cancelled' })
            .eq('id', id),
          3000,
          'Cancel invite'
        );
        if (!error) cancelled += 1;
      }

      for (const member of members) {
        const userId = text(member.user_id);
        const status = text(member.status || 'active').toLowerCase();
        if (!userId || userId === me || status === 'inactive') continue;
        const rpc = await waitFor(
          supabaseClient.rpc('fire_s_remove_member', {
            p_company_id: ctx.companyId,
            p_user_id: userId
          }),
          4000,
          'Remove member'
        );
        if (!rpc.error) removed += 1;
      }

      setMessage(
        `Cleared. Removed ${removed} member(s), cancelled ${cancelled} invite(s). You can add fresh employees now.`
      );
      await refreshTeam();
    } catch (error) {
      console.error('Clear other personnel failed:', error);
      setMessage(error.message || 'Could not clear other people.', true);
    }
  }

  async function cancelInvite(inviteId, inviteEmail) {
    try {
      if (!inviteId) return;
      setMessage('Cancelling invite…');
      const { error } = await waitFor(
        supabaseClient
          .from('company_invites')
          .update({ status: 'cancelled' })
          .eq('id', inviteId),
        3000,
        'Cancel invite'
      );
      if (error) throw error;
      forgetSeatEmail(inviteEmail);
      setMessage('Invite cancelled. You can add that email again.');
      await refreshTeam();
    } catch (error) {
      setMessage(error.message || 'Could not cancel invite.', true);
    }
  }

  function renderMembers(members) {
    const list = byId('companyTeamList');
    if (!list) return;

    const active = members.filter(m => text(m.status || 'active').toLowerCase() !== 'inactive');
    if (!active.length) {
      list.innerHTML =
        '<div class="company-team-empty">No personnel yet. Add someone by email above.</div>';
      return;
    }

    const me = text(window.currentUserProfile?.id);
    list.innerHTML = active
      .map(member => {
        const profile = member.profiles || {};
        const email = text(profile.email) || 'No email';
        const name = text(profile.full_name) || email;
        const role = text(member.role) || 'inspector';
        const isMe = text(member.user_id) === me;
        const memberKey = text(member.id || member.user_id);
        return `
          <article class="company-team-card" data-member-id="${esc(memberKey)}">
            <div class="company-team-card-main">
              <strong>${esc(name)}</strong>
              <span>${esc(email)}${isMe ? ' · you' : ''} · ${esc(roleLabel(role))}</span>
            </div>
            <div class="company-team-card-actions${isMe ? ' is-self' : ''}">
              <select data-role-select="${esc(memberKey)}" aria-label="Role for ${esc(email)}">
                ${roleOptionsHtml(role, !canAssignOwner())}
              </select>
              <button type="button" class="secondary-btn" data-save-role="${esc(memberKey)}" data-user-id="${esc(member.user_id)}">
                Change role
              </button>
              ${
                isMe
                  ? ''
                  : `<button type="button" class="secondary-btn" data-remove-member="${esc(member.user_id)}">Remove</button>`
              }
            </div>
          </article>
        `;
      })
      .join('');

    list.querySelectorAll('[data-save-role]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const memberId = btn.getAttribute('data-save-role');
        const userId = btn.getAttribute('data-user-id');
        const select = list.querySelector(`[data-role-select="${memberId}"]`);
        const nextRole = select ? select.value : 'inspector';
        await saveMemberRole(memberId, userId, nextRole);
      });
    });

    list.querySelectorAll('[data-remove-member]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.getAttribute('data-remove-member');
        if (!window.confirm('Remove this person from the company?')) return;
        await removeMember(userId);
      });
    });
  }

  async function removeMember(userId) {
    try {
      if (!canManageTeam()) {
        throw new Error('Only Manager or Owner can remove team members.');
      }
      const ctx = companyContext();
      if (!ctx.companyId || !userId) throw new Error('Missing company or person.');

      setMessage('Removing…');
      const rpc = await waitFor(
        supabaseClient.rpc('fire_s_remove_member', {
          p_company_id: ctx.companyId,
          p_user_id: userId
        }),
        4000,
        'Remove member'
      );
      if (rpc.error) throw rpc.error;
      setMessage('Person removed from the team.');
      await refreshTeam();
    } catch (error) {
      console.error('Remove member failed:', error);
      setMessage(error.message || 'Could not remove person.', true);
    }
  }

  async function saveMemberRole(memberId, userId, role) {
    try {
      if (!canManageTeam()) {
        throw new Error('Only Manager or Owner can change roles.');
      }
      if (role === 'company_owner' && !canAssignOwner()) {
        throw new Error('Only an Owner can assign the Owner role.');
      }

      setMessage('Saving role…');

      let query = supabaseClient
        .from('company_members')
        .update({ role })
        .eq('company_id', companyContext().companyId);

      if (memberId && memberId !== userId) {
        query = query.eq('id', memberId);
      } else {
        query = query.eq('user_id', userId);
      }

      const { error } = await waitFor(query, 3500, 'Save role');
      if (error) throw error;

      // Keep profiles.role roughly aligned when allowed (non-blocking).
      supabaseClient.from('profiles').update({ role }).eq('id', userId).then(() => {}).catch(() => {});

      setMessage(`Role updated to ${roleLabel(role)}.`);
      await refreshTeam();
    } catch (error) {
      console.error('Save role failed:', error);
      setMessage(error.message || 'Could not save role.', true);
    }
  }

  async function findProfileByEmail(email) {
    const normalised = text(email).toLowerCase();

    const result = await waitFor(
      supabaseClient
        .from('profiles')
        .select('id, email, full_name, role')
        .ilike('email', normalised)
        .maybeSingle(),
      3000,
      'Email lookup'
    );

    if (result?.error) throw result.error;
    return result?.data || null;
  }

  async function addMember() {
    try {
      if (!canManageTeam()) {
        throw new Error('Only Manager or Owner can add team members.');
      }

      const emailInput = byId('companyTeamEmail');
      const roleSelect = byId('companyTeamRole');
      const email = text(emailInput?.value).toLowerCase();
      const role = text(roleSelect?.value) || 'inspector';
      const ctx = companyContext();

      if (!email || !email.includes('@')) {
        throw new Error('Enter a valid email address.');
      }
      if (!ctx.companyId) {
        throw new Error('Save your company first, then add people.');
      }
      if (role === 'company_owner' && !canAssignOwner()) {
        throw new Error('Only an Owner can add another Owner.');
      }

      if (lastSeatEmails.indexOf(email) >= 0) {
        const reopenedEarly = await reopenCancelledInvite(ctx.companyId, email, role);
        if (reopenedEarly && reopenedEarly.ok) {
          await finishAddedPerson(email, role, 'reopened', emailInput, roleSelect, false);
          return;
        }
        throw new Error(duplicateSeatMessage(email));
      }

      setMessage('Adding person…');

      // Preferred: SECURITY DEFINER RPC (finds auth login even without profiles row)
      const rpc = await waitFor(
        supabaseClient.rpc('fire_s_add_member_by_email', {
          p_company_id: ctx.companyId,
          p_email: email,
          p_role: role
        }),
        6000,
        'Add member'
      );

      if (!rpc.error && rpc.data) {
        const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
        const status = text(row?.out_status || row?.status).toLowerCase();
        if (status === 'already' || status === 'duplicate') {
          const reopenedDup = await reopenCancelledInvite(ctx.companyId, email, role);
          if (reopenedDup && reopenedDup.ok) {
            await finishAddedPerson(email, role, 'reopened', emailInput, roleSelect, false);
            return;
          }
          throw new Error(duplicateSeatMessage(email));
        }
        await finishAddedPerson(
          email,
          role,
          status === 'invited' ? 'invited' : 'added',
          emailInput,
          roleSelect,
          true
        );
        return;
      }

      // Fallback: reopen a cancelled invite, then old profile lookup
      if (rpc.error) {
        const reopened = await reopenCancelledInvite(ctx.companyId, email, role);
        if (reopened && reopened.ok) {
          await finishAddedPerson(email, role, 'reopened', emailInput, roleSelect, false);
          return;
        }
        const rpcMsg = text(rpc.error.message).toLowerCase();
        if (isOtherCompanySeatError(rpcMsg)) {
          throw new Error(otherCompanySeatMessage(email));
        }
        if (
          rpcMsg.indexOf('paid seat') >= 0 ||
          rpcMsg.indexOf('already') >= 0 ||
          rpcMsg.indexOf('do not enter') >= 0 ||
          rpcMsg.indexOf('duplicate key') >= 0 ||
          rpcMsg.indexOf('unique') >= 0
        ) {
          throw new Error(rpc.error.message || duplicateSeatMessage(email));
        }
        console.warn('Add member RPC failed, trying profile lookup:', rpc.error);
      }

      const profile = await findProfileByEmail(email);
      if (!profile?.id) {
        throw new Error(
          (rpc.error && rpc.error.message) ||
            'Could not add that email. Run SUPABASE_smooth_onboarding.sql in Supabase, then try again.'
        );
      }

      setMessage('Adding to company…');

      const payload = {
        company_id: ctx.companyId,
        user_id: profile.id,
        role,
        status: 'active'
      };

      let error = null;
      const upsert = await supabaseClient
        .from('company_members')
        .upsert(payload, { onConflict: 'company_id,user_id' });
      error = upsert.error;

      if (error) {
        const existing = await supabaseClient
          .from('company_members')
          .select('id')
          .eq('company_id', ctx.companyId)
          .eq('user_id', profile.id)
          .maybeSingle();

        if (existing.data?.id) {
          const updated = await supabaseClient
            .from('company_members')
            .update({ role, status: 'active' })
            .eq('id', existing.data.id);
          error = updated.error;
        } else {
          const inserted = await supabaseClient.from('company_members').insert(payload);
          error = inserted.error;
        }
      }

      if (error) throw error;

      try {
        await supabaseClient.from('profiles').update({ role }).eq('id', profile.id);
      } catch (_) {}

      if (emailInput) emailInput.value = '';
      if (roleSelect) roleSelect.value = 'inspector';
      setMessage(
        `${profile.email || email} is a new subscription (${roleLabel(role)}). Company S invoices the owner, not this person.`
      );
      await refreshTeam();
      notifyOwnerPaysSubscription(profile.email || email, roleLabel(role));
    } catch (error) {
      console.error('Add member failed:', error);
      setMessage(error.message || 'Could not add team member.', true);
    }
  }

  async function createCompanyAndLink() {
    try {
      const user = await requireUser();
      const alreadyLinked = !!text(window.currentUserProfile?.companyId);
      const freshMode = isFreshCompanyMode();
      // Anyone without a company can create one and become Owner.
      // Fresh mode / super_admin can start a brand-new company even if linked.
      if (alreadyLinked && !freshMode && !canAssignOwner()) {
        throw new Error('Only an Owner / Super Admin can create the company link.');
      }

      const nameInput = byId('companyTeamCompanyName');
      const companyName =
        text(nameInput?.value) ||
        text(window.currentUserProfile?.companyName) ||
        (freshMode ? 'New Fire-S Company' : 'Fire-S Company');

      setMessage(freshMode || alreadyLinked ? 'Starting brand-new company…' : 'Creating company…');

      let company = null;
      const useFreshRpc = freshMode || alreadyLinked;

      // Preferred path: SECURITY DEFINER RPC (avoids companies RLS blocks)
      const rpcName = useFreshRpc ? 'fire_s_start_fresh_company' : 'fire_s_create_company';
      const rpc = await waitFor(
        supabaseClient.rpc(rpcName, { p_name: companyName }),
        6000,
        'Create company'
      );

      if (!rpc.error && rpc.data) {
        const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
        if (row?.company_id || row?.out_company_id || row?.id) {
          company = {
            id: row.company_id || row.out_company_id || row.id,
            name:
              row.company_name ||
              row.out_company_name ||
              row.name ||
              companyName
          };
        }
      }

      // Fallback: direct insert (may still fail if RLS blocks it)
      if (!company?.id) {
        if (rpc.error) {
          console.warn('RPC create company failed, trying direct insert:', rpc.error);
        }

        if (useFreshRpc) {
          try {
            await supabaseClient
              .from('company_members')
              .update({ status: 'inactive' })
              .eq('user_id', user.id)
              .eq('status', 'active');
          } catch (_) {}
        }

        const insertCompany = await supabaseClient
          .from('companies')
          .insert({
            name: companyName,
            status: 'active',
            plan: 'development'
          })
          .select('id, name, status, plan')
          .single();

        if (insertCompany.error) {
          throw new Error(
            (rpc.error && rpc.error.message) ||
              insertCompany.error.message ||
              'Could not create company. Run SUPABASE_company_team.sql in Supabase first.'
          );
        }

        company = insertCompany.data;

        const memberPayload = {
          company_id: company.id,
          user_id: user.id,
          role: 'company_owner',
          status: 'active'
        };

        let memberError = null;
        const upsert = await supabaseClient
          .from('company_members')
          .upsert(memberPayload, { onConflict: 'company_id,user_id' });
        memberError = upsert.error;

        if (memberError) {
          const inserted = await supabaseClient
            .from('company_members')
            .insert(memberPayload);
          memberError = inserted.error;
        }
        if (memberError) throw memberError;
      }

      try {
        await supabaseClient
          .from('profiles')
          .update({ role: 'company_owner' })
          .eq('id', user.id);
      } catch (_) {}

      setFreshCompanyMode(false);

      try {
        if (typeof window.loadUserAccessProfile === 'function') {
          await window.loadUserAccessProfile();
        } else if (typeof loadUserAccessProfile === 'function') {
          await loadUserAccessProfile();
        }
      } catch (_) {}

      applySharedProfile({
        id: user.id,
        email: user.email,
        role: 'company_owner',
        companyId: company.id,
        companyName: company.name
      });
      rememberCompanyName(company.id, company.name || companyName);
      try {
        if (typeof window.fireSApplyCleanHomeRoles === 'function') {
          window.fireSApplyCleanHomeRoles();
        }
      } catch (_) {}
      try {
        if (typeof window.refreshSyncData === 'function') {
          Promise.resolve(window.refreshSyncData()).catch(() => {});
        }
      } catch (_) {}
      try {
        if (typeof window.fireSRefreshCompanyPersonnelStats === 'function') {
          window.fireSRefreshCompanyPersonnelStats();
        }
      } catch (_) {}

      if (nameInput) nameInput.value = company.name || companyName;
      updateFreshBanner();
      updateStartFreshButton(true);

      // Instant UI update — do not wait on another slow network round-trip.
      const setupPanel = byId('companyTeamSetupPanel');
      const addPanel = byId('companyTeamAddPanel');
      if (setupPanel) setupPanel.style.display = 'none';
      if (addPanel) addPanel.style.display = '';
      window.__fireSTeamAfterCreate = true;
      setLaterButtonVisible(true);
      const ownerRow = {
        user_id: user.id,
        role: 'company_owner',
        status: 'active',
        profiles: {
          id: user.id,
          email: user.email,
          full_name: window.currentUserProfile?.fullName || user.email
        }
      };
      renderMeta(companyContext(), [ownerRow]);
      renderMembers([ownerRow]);
      setMessage(
        `“${company.name}” is ready. Manage personnel below — add, change roles, or remove.`
      );

      // Soft refresh in background (ignore failures).
      setTimeout(() => {
        refreshTeam().catch(() => {});
      }, 50);
    } catch (error) {
      console.error('Create company failed:', error);
      const msg = String(error.message || '');
      if (/company_id.*ambiguous/i.test(msg)) {
        setMessage(
          'Database fix needed: run SUPABASE_fix_create_company_ambiguous.sql in Supabase SQL Editor, then Save company again.',
          true
        );
        return;
      }
      setMessage(
        error.message ||
          'Could not create company. Run SUPABASE_company_team.sql in Supabase SQL Editor, then try again.',
        true
      );
    }
  }

  function showSetupState(ctx, message) {
    const addPanel = byId('companyTeamAddPanel');
    const setupPanel = byId('companyTeamSetupPanel');
    const list = byId('companyTeamList');
    updateFreshBanner();
    updateStartFreshButton(!!(window.currentUserProfile?.companyId) && !isFreshCompanyMode());
    setLaterButtonVisible(false);
    // Keep the Personnel framing — create name is only the first step.
    const heading = byId('companyTeamHeading');
    const kicker = byId('companyTeamKicker');
    const title = byId('companyTeamTitle');
    const subtitle = byId('companyTeamSubtitle');
    const intro = document.querySelector('#companyTeamSection .company-team-intro');
    if (intro) intro.classList.add('is-setup');
    if (heading) heading.textContent = 'Personnel';
    if (kicker) kicker.textContent = 'Get started';
    if (title) title.textContent = 'Name your company';
    if (subtitle) {
      subtitle.textContent =
        'Save the company name once. Then you add people, change roles, or remove staff.';
    }
    const meta = byId('companyTeamMeta');
    if (meta) {
      meta.textContent = isRoleTestManagementView()
        ? 'Role Test · no company linked yet'
        : 'No company linked yet';
    }
    if (setupPanel) setupPanel.style.display = '';
    if (addPanel) addPanel.style.display = 'none';
    if (list) {
      list.innerHTML =
        '<div class="company-team-empty">Save the company name above, then manage personnel here.</div>';
    }
    const pending = byId('companyTeamPendingList');
    if (pending) pending.innerHTML = '';
    const nameInput = byId('companyTeamCompanyName');
    if (nameInput) {
      const email = text(window.currentUserProfile?.email);
      nameInput.value = isFreshCompanyMode()
        ? 'My Fire Safety Company'
        : email.includes('@')
          ? `${email.split('@')[0]} Fire Safety`
          : 'Fire-S Company';
    }
    setMessage(
      message ||
        'Name your company once. After that you manage personnel here.',
      false
    );
  }

  async function refreshTeam() {
    const addPanel = byId('companyTeamAddPanel');
    const setupPanel = byId('companyTeamSetupPanel');
    const list = byId('companyTeamList');
    updateFreshBanner();

    try {
      let user = null;
      try {
        user = await requireUser();
      } catch (authError) {
        // Do not freeze Company Team on a slow auth ping.
        showSetupState(
          companyContext(),
          authError.message ||
            'Could not confirm login quickly. Use Cloud → Login, then try Create company again.'
        );
        return;
      }

      // Brand-new company mode: always show Create company first.
      if (isFreshCompanyMode()) {
        showSetupState(
          companyContext(),
          'Brand-new company mode: name the company, then manage personnel.'
        );
        return;
      }

      let ctx = companyContext();

      // If profile has no company yet, try a quick membership lookup.
      if (!ctx.companyId && user?.id) {
        try {
          const discovered = await discoverCompanyForUser(user.id);
          if (discovered?.companyId) {
            applySharedProfile({
              id: user.id,
              email: user.email,
              role: discovered.role || currentRole(),
              companyId: discovered.companyId,
              companyName: discovered.companyName
            });
            ctx = companyContext();
            try {
              if (typeof window.fireSApplyCleanHomeRoles === 'function') {
                window.fireSApplyCleanHomeRoles();
              }
            } catch (_) {}
            try {
              if (typeof window.refreshSyncData === 'function') {
                Promise.resolve(window.refreshSyncData()).catch(() => {});
              }
            } catch (_) {}
          }
        } catch (discoverError) {
          console.warn('Company discover failed:', discoverError);
        }
      }

      // No company yet: allow Create company for any signed-in user.
      if (!ctx.companyId) {
        showSetupState(
          ctx,
          'No company linked yet. Enter a name and click Save company.'
        );
        return;
      }

      if (!canManageTeam()) {
        if (addPanel) addPanel.style.display = 'none';
        if (setupPanel) setupPanel.style.display = 'none';
        setLaterButtonVisible(false);
        if (list) {
          list.innerHTML =
            '<div class="company-team-empty">Personnel management is available to Managers and Owners.</div>';
        }
        renderMeta(ctx, []);
        updateStartFreshButton(false);
        setMessage('You can view the company, but only Managers/Owners can manage personnel.', true);
        return;
      }

      if (setupPanel) setupPanel.style.display = 'none';
      if (addPanel) addPanel.style.display = '';
      updateStartFreshButton(true);

      setMessage('Loading personnel…');
      // Company name is the page hero — resolve it if still generic.
      if (isGenericCompanyName(ctx.companyName)) {
        const realName = await fetchCompanyName(ctx.companyId);
        if (realName) {
          rememberCompanyName(ctx.companyId, realName);
          ctx = companyContext();
          try {
            if (typeof window.fireSApplyCleanHomeRoles === 'function') {
              window.fireSApplyCleanHomeRoles();
            }
          } catch (_) {}
        }
      } else {
        rememberCompanyName(ctx.companyId, ctx.companyName);
      }
      const members = await loadMembers(ctx.companyId);
      const invites = await loadPendingInvites(ctx.companyId);
      rememberSeatEmails(members, invites);
      renderMeta(ctx, members, invites);
      renderPendingInvites(invites);
      renderMembers(members);
      if (window.__fireSTeamAfterCreate) {
        setLaterButtonVisible(true);
        setMessage(
          `“${ctx.companyName || 'Your company'}” is ready. Add personnel now — or do it later.`
        );
      } else {
        setLaterButtonVisible(false);
        setMessage(
          members.length || invites.length
            ? ''
            : 'Add your first Inspector or Manager below.'
        );
      }
    } catch (error) {
      console.error('Refresh team failed:', error);
      const ctx = companyContext();
      if (!ctx.companyId || isFreshCompanyMode()) {
        showSetupState(ctx, error.message || 'Could not load company yet.');
        return;
      }
      renderMeta(ctx, []);
      if (list) {
        list.innerHTML = `<div class="company-team-empty">${esc(error.message || 'Could not load team.')}</div>`;
      }
      if (setupPanel) setupPanel.style.display = 'none';
      if (addPanel) addPanel.style.display = '';
      updateStartFreshButton(true);
      setMessage(error.message || 'Could not load team.', true);
    }
  }

  function beginFreshCompany() {
    setFreshCompanyMode(true);
    showSetupState(
      companyContext(),
      'Brand-new company mode: name the company, then manage personnel.'
    );
  }

  function exitFreshCompany() {
    setFreshCompanyMode(false);
    refreshTeam().catch(() => {});
  }

  async function openCompanyTeam(options) {
    if (options && options.afterCreate) {
      window.__fireSTeamAfterCreate = true;
    } else if (!(options && options.keepAfterCreate)) {
      // Re-open from Home is ongoing management, not first-day create.
      window.__fireSTeamAfterCreate = false;
    }
    showCompanyTeamSection();
    updateFreshBanner();
    // Paint something immediately so the screen never looks frozen.
    const ctx = companyContext();
    if (!ctx.companyId || isFreshCompanyMode()) {
      showSetupState(
        ctx,
        isFreshCompanyMode()
          ? 'Brand-new company mode: name the company, then manage personnel.'
          : 'Checking your company link…'
      );
    } else {
      setLaterButtonVisible(!!window.__fireSTeamAfterCreate);
      renderMeta(ctx, []);
      setMessage(
        window.__fireSTeamAfterCreate
          ? `“${ctx.companyName || 'Your company'}” is ready. Manage personnel below.`
          : 'Loading personnel…'
      );
    }
    await refreshTeam();
  }

  function goHome() {
    const section = byId('companyTeamSection');
    if (section) section.style.display = 'none';
    try {
      if (typeof window.showHome === 'function') window.showHome();
      else if (typeof showHome === 'function') showHome();
    } catch (_) {}
  }

  function wrapOpenCompanyCommand() {
    const previous =
      typeof window.openCompanyCommand === 'function'
        ? window.openCompanyCommand
        : typeof openCompanyCommand === 'function'
          ? openCompanyCommand
          : null;

    const wrapped = function fireSOpenCompanyTeam() {
      // Keep old cloud-open behaviour as fallback for inspectors.
      if (!canManageTeam()) {
        if (typeof previous === 'function') return previous();
        const cloudBtn = byId('cloudMenuBtn');
        if (cloudBtn) cloudBtn.click();
        return;
      }
      return openCompanyTeam();
    };

    window.openCompanyCommand = wrapped;
    try {
      openCompanyCommand = wrapped;
    } catch (_) {}

    // Re-bind home card if present — capture phase so Personnel always opens
    // even if older Home controllers rewrote onclick.
    const btn = byId('cmdCompanyBtn');
    if (btn && !btn.__fireSPersonnelBound) {
      btn.__fireSPersonnelBound = true;
      btn.addEventListener(
        'click',
        function fireSPersonnelCardClick(event) {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          wrapped();
        },
        true
      );
    }
    if (btn) {
      btn.onclick = function (event) {
        if (event) event.preventDefault();
        wrapped();
      };
    }
  }

  function bindUi() {
    const back = byId('companyTeamBackBtn');
    if (back && !back.__fireSCompanyBound) {
      back.__fireSCompanyBound = true;
      back.addEventListener('click', goHome);
    }

    const addBtn = byId('companyTeamAddBtn');
    if (addBtn && !addBtn.__fireSCompanyBound) {
      addBtn.__fireSCompanyBound = true;
      addBtn.addEventListener('click', addMember);
    }

    const laterBtn = byId('companyTeamLaterBtn');
    if (laterBtn && !laterBtn.__fireSCompanyBound) {
      laterBtn.__fireSCompanyBound = true;
      laterBtn.addEventListener('click', () => {
        window.__fireSTeamAfterCreate = false;
        setLaterButtonVisible(false);
        goHome();
      });
    }

    const clearOthersBtn = byId('companyTeamClearOthersBtn');
    if (clearOthersBtn && !clearOthersBtn.__fireSCompanyBound) {
      clearOthersBtn.__fireSCompanyBound = true;
      clearOthersBtn.addEventListener('click', clearOtherPersonnel);
    }

    const createBtn = byId('companyTeamCreateBtn');
    if (createBtn && !createBtn.__fireSCompanyBound) {
      createBtn.__fireSCompanyBound = true;
      createBtn.addEventListener('click', createCompanyAndLink);
    }

    const startFreshBtn = byId('companyTeamStartFreshBtn');
    if (startFreshBtn && !startFreshBtn.__fireSCompanyBound) {
      startFreshBtn.__fireSCompanyBound = true;
      startFreshBtn.addEventListener('click', beginFreshCompany);
    }

    const exitFreshBtn = byId('companyTeamExitFreshBtn');
    if (exitFreshBtn && !exitFreshBtn.__fireSCompanyBound) {
      exitFreshBtn.__fireSCompanyBound = true;
      exitFreshBtn.addEventListener('click', exitFreshCompany);
    }

    // Manager cannot offer Owner in the add dropdown.
    const roleSelect = byId('companyTeamRole');
    if (roleSelect) {
      [...roleSelect.options].forEach(opt => {
        if (opt.value === 'company_owner') {
          opt.disabled = !canAssignOwner();
          opt.hidden = !canAssignOwner();
        }
      });
    }
  }

  function init() {
    bindUi();
    wrapOpenCompanyCommand();
  }

  window.fireSOpenCompanyTeam = openCompanyTeam;
  window.openCompanyTeamOverlay = openCompanyTeam;
  window.fireSRefreshCompanyTeam = refreshTeam;
  window.fireSRefreshCompanyTeamChrome = refreshPersonnelChrome;
  window.fireSRememberCompanyName = rememberCompanyName;
  window.fireSBeginFreshCompany = beginFreshCompany;
  window.fireSIsClosedInviteStatus = isClosedInviteStatus;
  window.fireSReopenCancelledInvite = reopenCancelledInvite;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  setTimeout(init, 400);
})();
