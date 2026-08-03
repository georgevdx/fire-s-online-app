/* ============================================================
   Fire-S Company Team (#5)
   Load AFTER app.js.
   Purpose:
   - Owner/Manager/Super Admin can open a Company Team workspace
   - List company_members
   - Add existing Fire-S users by email
   - Assign Inspector / Manager / Owner roles
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

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value || '').trim();
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

  function currentRole() {
    try {
      if (typeof window.fireSViewAsRole131 === 'function') {
        const viewed = text(window.fireSViewAsRole131()).toLowerCase();
        if (viewed === 'new_company') return 'company_owner';
        if (viewed) return viewed;
      }
    } catch (_) {}
    try {
      if (typeof window.getCurrentUserRole === 'function') {
        const role = text(window.getCurrentUserRole()).toLowerCase();
        if (role === 'new_company') return 'company_owner';
        return role;
      }
    } catch (_) {}
    return text(window.currentUserProfile?.role).toLowerCase();
  }

  function canManageTeam() {
    if (isFreshCompanyMode()) return true;
    const role = currentRole();
    return ['company_owner', 'super_admin', 'manager'].includes(role);
  }

  function canAssignOwner() {
    if (isFreshCompanyMode()) return true;
    const role = currentRole();
    return role === 'company_owner' || role === 'super_admin';
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
    return {
      companyId: profile.companyId || null,
      companyName: profile.companyName || 'Your company',
      email: profile.email || '',
      role: profile.role || currentRole()
    };
  }

  async function discoverCompanyForUser(userId) {
    // One lightweight query only — company name can stay generic for speed.
    const basic = await waitFor(
      supabaseClient
        .from('company_members')
        .select('company_id, role, status')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle(),
      2000,
      'Company lookup'
    );

    if (basic?.error) throw basic.error;
    const row = basic?.data;
    if (!row?.company_id) return null;

    return {
      companyId: row.company_id,
      companyName: window.currentUserProfile?.companyName || 'Your company',
      role: row.role || 'company_owner'
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

    return rows.map(row => ({
      ...row,
      profiles: profilesById[row.user_id] || null
    }));
  }

  function hideOtherSections() {
    [
      'homeSection',
      'servicesSection',
      'projectListSection',
      'projectFormSection',
      'findingsCentreSection'
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

  function renderMeta(ctx, members) {
    const meta = byId('companyTeamMeta');
    const title = byId('companyTeamTitle');
    if (title) title.textContent = ctx.companyName || 'Manage your team';
    if (!meta) return;
    const active = members.filter(m => text(m.status).toLowerCase() !== 'inactive').length;
    meta.textContent = `${ctx.companyName} · ${active} member(s) · Your role: ${roleLabel(ctx.role)}`;
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
            <div class="company-team-card-actions">
              <button type="button" class="secondary-btn" data-cancel-invite="${esc(id)}">
                Cancel
              </button>
            </div>
          </article>`;
        })
        .join('');

    list.querySelectorAll('[data-cancel-invite]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await cancelInvite(btn.getAttribute('data-cancel-invite'));
      });
    });
  }

  async function cancelInvite(inviteId) {
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
      setMessage('Invite cancelled.');
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
        '<div class="company-team-empty">No active team members yet. Add emails above.</div>';
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
              <span>${esc(email)}${isMe ? ' · you' : ''}</span>
            </div>
            <div class="company-team-card-actions">
              <select data-role-select="${esc(memberKey)}" aria-label="Role for ${esc(email)}">
                ${roleOptionsHtml(role, !canAssignOwner())}
              </select>
              <button type="button" class="secondary-btn" data-save-role="${esc(memberKey)}" data-user-id="${esc(member.user_id)}">
                Save role
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
        if (!window.confirm('Remove this person from the company team?')) return;
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
        if (emailInput) emailInput.value = '';
        if (roleSelect) roleSelect.value = 'inspector';
        if (status === 'invited') {
          setMessage(
            `${email} saved as ${roleLabel(role)}. They only need to install Fire-S and login with this email.`
          );
        } else {
          setMessage(`${email} added as ${roleLabel(role)}.`);
        }
        await refreshTeam();
        return;
      }

      // Fallback: old profile lookup path
      if (rpc.error) {
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
      setMessage(`${profile.email || email} added as ${roleLabel(role)}.`);
      await refreshTeam();
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

      window.currentUserProfile = {
        ...(window.currentUserProfile || {}),
        id: user.id,
        email: user.email,
        role: 'company_owner',
        companyId: company.id,
        companyName: company.name
      };

      if (nameInput) nameInput.value = company.name || companyName;
      updateFreshBanner();
      updateStartFreshButton(true);

      // Instant UI update — do not wait on another slow network round-trip.
      const setupPanel = byId('companyTeamSetupPanel');
      const addPanel = byId('companyTeamAddPanel');
      if (setupPanel) setupPanel.style.display = 'none';
      if (addPanel) addPanel.style.display = '';
      renderMeta(companyContext(), [
        {
          user_id: user.id,
          role: 'company_owner',
          status: 'active',
          profiles: {
            id: user.id,
            email: user.email,
            full_name: window.currentUserProfile?.fullName || user.email
          }
        }
      ]);
      renderMembers([
        {
          user_id: user.id,
          role: 'company_owner',
          status: 'active',
          profiles: {
            id: user.id,
            email: user.email,
            full_name: window.currentUserProfile?.fullName || user.email
          }
        }
      ]);
      setMessage(
        `Company “${company.name}” is ready. Add Inspectors and Managers below.`
      );

      // Soft refresh in background (ignore failures).
      setTimeout(() => {
        refreshTeam().catch(() => {});
      }, 50);
    } catch (error) {
      console.error('Create company failed:', error);
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
    renderMeta(ctx || companyContext(), []);
    if (setupPanel) setupPanel.style.display = '';
    if (addPanel) addPanel.style.display = 'none';
    if (list) {
      list.innerHTML =
        '<div class="company-team-empty">Create your company above, then appoint Inspectors and Managers.</div>';
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
        'Day 1: create your company, then add your first team members.',
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
          'Brand-new company mode: create your company, then appoint members.'
        );
        return;
      }

      let ctx = companyContext();

      // If profile has no company yet, try a quick membership lookup.
      if (!ctx.companyId && user?.id) {
        try {
          const discovered = await discoverCompanyForUser(user.id);
          if (discovered?.companyId) {
            window.currentUserProfile = {
              ...(window.currentUserProfile || {}),
              id: user.id,
              email: user.email,
              role: discovered.role || currentRole(),
              companyId: discovered.companyId,
              companyName: discovered.companyName
            };
            ctx = companyContext();
          }
        } catch (discoverError) {
          console.warn('Company discover failed:', discoverError);
        }
      }

      // No company yet: allow Create company for any signed-in user.
      if (!ctx.companyId) {
        showSetupState(
          ctx,
          'No company linked yet. Enter a name and click Create company.'
        );
        return;
      }

      if (!canManageTeam()) {
        if (addPanel) addPanel.style.display = 'none';
        if (setupPanel) setupPanel.style.display = 'none';
        if (list) {
          list.innerHTML =
            '<div class="company-team-empty">Company Team is available to Managers and Owners.</div>';
        }
        renderMeta(ctx, []);
        updateStartFreshButton(false);
        setMessage('You can view company info, but only Managers/Owners can edit the team.', true);
        return;
      }

      if (setupPanel) setupPanel.style.display = 'none';
      if (addPanel) addPanel.style.display = '';
      updateStartFreshButton(true);

      setMessage('Loading team members…');
      const members = await loadMembers(ctx.companyId);
      const invites = await loadPendingInvites(ctx.companyId);
      renderMeta(ctx, members);
      renderPendingInvites(invites);
      renderMembers(members);
      if (window.__fireSTeamAfterCreate) {
        window.__fireSTeamAfterCreate = false;
        setMessage(
          'Company ready. Add Inspectors and Managers now — or tap “Do this later”.'
        );
      } else {
        setMessage(
          members.length || invites.length
            ? ''
            : 'Add Inspectors and Managers below, or do it later from Team.'
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
    const title = byId('companyTeamTitle');
    if (title) title.textContent = 'Your new company';
    showSetupState(
      companyContext(),
      'Brand-new company mode: create your company, then appoint members.'
    );
  }

  function exitFreshCompany() {
    setFreshCompanyMode(false);
    const title = byId('companyTeamTitle');
    if (title) title.textContent = 'Manage your team';
    refreshTeam().catch(() => {});
  }

  async function openCompanyTeam(options) {
    if (options && options.afterCreate) {
      window.__fireSTeamAfterCreate = true;
    }
    showCompanyTeamSection();
    updateFreshBanner();
    // Paint something immediately so the screen never looks frozen.
    const ctx = companyContext();
    if (!ctx.companyId || isFreshCompanyMode()) {
      showSetupState(
        ctx,
        isFreshCompanyMode()
          ? 'Brand-new company mode: create your company, then appoint members.'
          : 'Checking your company link…'
      );
    } else {
      renderMeta(ctx, []);
      setMessage(
        window.__fireSTeamAfterCreate
          ? 'Company ready. Add your team below — or do it later.'
          : 'Loading company team…'
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

    // Re-bind home card if present.
    const btn = byId('cmdCompanyBtn');
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
        goHome();
      });
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
  window.fireSBeginFreshCompany = beginFreshCompany;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  setTimeout(init, 400);
})();
