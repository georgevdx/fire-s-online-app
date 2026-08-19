/* ============================================================
   Fire-S Simple Cloud Sync (#3)
   Load AFTER app.js + clean-home module.
   Purpose:
   - One clear Sync Now path for normal users
   - Hide advanced upload/download/merge/admin tools by default
   - Keep existing sync engines; only simplify the UI/UX layer
   ============================================================ */
(function fireSSimpleCloudSync() {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value || '').trim();
  }

  function viewRole() {
    try {
      if (typeof window.fireSViewAsRole131 === 'function') {
        return text(window.fireSViewAsRole131()).toLowerCase();
      }
    } catch (_) {}
    try {
      if (typeof window.getCurrentUserRole === 'function') {
        return text(window.getCurrentUserRole()).toLowerCase();
      }
    } catch (_) {}
    try {
      return text(window.currentUserProfile?.role).toLowerCase();
    } catch (_) {}
    return 'guest';
  }

  function actualRole() {
    try {
      if (typeof window.fireSActualUserRole131 === 'function') {
        return text(window.fireSActualUserRole131()).toLowerCase();
      }
    } catch (_) {}
    try {
      return text(window.currentUserProfile?.role).toLowerCase();
    } catch (_) {}
    return viewRole();
  }

  function isInspectorLike(role) {
    return ['inspector', 'guest', 'local', '', 'field_inspector'].includes(role);
  }

  function canSeeAdvancedTools(email) {
    const actual = actualRole();
    if (actual === 'super_admin') return true;
    try {
      if (typeof window.isAllowedAdminEmail === 'function') {
        return !!window.isAllowedAdminEmail(email);
      }
    } catch (_) {}
    const allowed = [
      'georgevdx@gmail.com',
      'johandb1974ik@gmail.com',
      'johandb@live.com'
    ];
    return allowed.includes(text(email).toLowerCase());
  }

  function canSeeExportBackup(role) {
    return (
      role === 'company_owner' ||
      role === 'super_admin' ||
      role === 'manager'
    );
  }

  function setStatus(message) {
    const el = byId('syncStatus');
    if (el) el.textContent = message;
  }

  function simplifyLabels() {
    const refresh = byId('refreshSyncBtn');
    if (refresh) refresh.textContent = 'Sync Now';

    const advanced = byId('showSyncToolsBtn');
    if (advanced) advanced.textContent = 'Advanced tools';

    const upload = byId('syncUploadBtn');
    if (upload) upload.textContent = 'Upload only';

    const download = byId('syncDownloadBtn');
    if (download) download.textContent = 'Download only';

    const merge = byId('syncMergeBtn');
    if (merge) merge.textContent = 'Merge sync';
  }

  function hideAdvancedPanels() {
    ['syncButtonsSection', 'syncButtonsPanel', 'cloudAdminPanel'].forEach(id => {
      const el = byId(id);
      if (el) el.style.display = 'none';
    });
  }

  function cloudDropdownBox(btnRect, viewportWidth) {
    const margin = 12;
    const gap = 8;
    const vw = Number(viewportWidth) || 0;
    const width = Math.min(320, Math.max(200, vw - margin * 2));
    let left = Number(btnRect && btnRect.right) - width;
    if (left < margin) left = margin;
    if (left + width > vw - margin) {
      left = Math.max(margin, vw - margin - width);
    }
    return {
      top: Number(btnRect && btnRect.bottom) + gap,
      left,
      width
    };
  }

  function isDropdownOpen(drop) {
    if (!drop) return false;
    if (drop.hidden) return false;
    const inline = String(drop.style.display || '').toLowerCase();
    if (inline === 'none') return false;
    if (inline === 'block' || inline === 'flex') return true;
    try {
      return window.getComputedStyle(drop).display !== 'none';
    } catch (_) {
      return inline !== 'none';
    }
  }

  let placingDropdown = false;

  function placeCloudDropdown() {
    const btn = byId('cloudMenuBtn');
    const drop = byId('cloudDropdown');
    if (!btn || !drop || placingDropdown) return;
    if (!isDropdownOpen(drop)) return;
    placingDropdown = true;
    try {
      if (window.innerWidth <= 720) {
        drop.style.position = '';
        drop.style.top = '';
        drop.style.left = '';
        drop.style.right = '';
        drop.style.width = '';
        drop.style.maxWidth = '';
        return;
      }
      const box = cloudDropdownBox(btn.getBoundingClientRect(), window.innerWidth);
      drop.style.position = 'fixed';
      drop.style.top = `${Math.round(box.top)}px`;
      drop.style.left = `${Math.round(box.left)}px`;
      drop.style.right = 'auto';
      drop.style.width = `${Math.round(box.width)}px`;
      drop.style.maxWidth = 'none';
      drop.style.zIndex = '100001';
    } catch (_) {
    } finally {
      placingDropdown = false;
    }
  }

  function bindCloudDropdownPlacement() {
    const drop = byId('cloudDropdown');
    if (!drop || drop.__fireSPlaceBound) return;
    drop.__fireSPlaceBound = true;
    try {
      const observer = new MutationObserver(placeCloudDropdown);
      observer.observe(drop, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    } catch (_) {}
    window.addEventListener('resize', placeCloudDropdown);
    window.addEventListener('scroll', placeCloudDropdown, true);
  }

  async function applySimpleCloudUi() {
    simplifyLabels();

    const cloudMenuBtn = byId('cloudMenuBtn');
    const connectedView = byId('cloudConnectedView');
    const loginToolsPanel = byId('loginToolsPanel');
    const showSyncToolsBtn = byId('showSyncToolsBtn');
    const exportBtn = byId('cloudExportBackupBtn');
    const signupBtn = byId('signupBtn');
    const connectedLabel = byId('cloudConnectedLabel');
    const help = byId('cloudSimpleHelp');

    let isLoggedIn = false;
    let email = '';

    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient?.auth?.getUser) {
        const { data, error } = await supabaseClient.auth.getUser();
        isLoggedIn = !error && !!data?.user;
        email = data?.user?.email || '';
      }
    } catch (_) {}

    const role = viewRole();
    const advanced = isLoggedIn && canSeeAdvancedTools(email);
    const exportOk = isLoggedIn && canSeeExportBackup(role);

    if (cloudMenuBtn) {
      cloudMenuBtn.classList.toggle('connected', isLoggedIn);
      cloudMenuBtn.textContent = isLoggedIn ? 'Cloud · Synced' : 'Cloud';
      cloudMenuBtn.title = isLoggedIn
        ? `Signed in as ${email || 'user'}`
        : 'Sign in to sync inspections';
    }

    if (connectedView) {
      connectedView.style.display = isLoggedIn ? 'block' : 'none';
    }

    if (loginToolsPanel) {
      loginToolsPanel.style.display = isLoggedIn ? 'none' : 'block';
    }

    if (connectedLabel) {
      connectedLabel.textContent = email
        ? `Signed in as ${email}`
        : 'Cloud: Connected';
    }

    if (help) {
      if (isInspectorLike(role)) {
        help.textContent =
          'Tap Sync Now before and after site work so your inspections stay safe in the cloud.';
      } else {
        help.textContent =
          'Sync Now uploads local changes and downloads newer cloud inspections.';
      }
    }

    if (showSyncToolsBtn) {
      showSyncToolsBtn.style.display = advanced ? 'block' : 'none';
      if (!advanced) hideAdvancedPanels();
    }

    if (exportBtn) {
      exportBtn.style.display = exportOk ? 'block' : 'none';
    }

    // Auth lives on Home Access — never re-show Cloud Login/Register fields.
    const legacyAuth = byId('fireSLegacyCloudAuth');
    if (legacyAuth) {
      legacyAuth.style.display = 'none';
      legacyAuth.setAttribute('aria-hidden', 'true');
    }
    const openAccessBtn = byId('cloudOpenAccessBtn');
    if (openAccessBtn) {
      openAccessBtn.style.display = isLoggedIn ? 'none' : '';
      openAccessBtn.hidden = !!isLoggedIn;
    }
    if (signupBtn) {
      signupBtn.style.display = 'none';
      signupBtn.hidden = true;
    }
    const signupCompanyName = byId('signupCompanyName');
    if (signupCompanyName) {
      signupCompanyName.style.display = 'none';
      signupCompanyName.hidden = true;
    }

    if (!isLoggedIn) {
      hideAdvancedPanels();
      setStatus('Not signed in. Use Access on Home.');
    } else {
      const current = text(byId('syncStatus')?.textContent);
      if (
        !current ||
        /connected\. auto sync|not connected|admin \/ sync|not signed in/i.test(current)
      ) {
        setStatus('Ready. Use Sync Now to update this device.');
      }
    }

    document.body.classList.add('fire-s-simple-cloud');
    document.body.dataset.fireSCloudRole = role || 'guest';
  }

  function wrapRefreshMessages() {
    if (typeof window.refreshSyncData !== 'function') return;
    if (window.refreshSyncData.__fireSSimpleCloudWrapped) return;

    const original = window.refreshSyncData;
    const wrapped = async function fireSSimpleRefreshSyncData() {
      const btn = byId('refreshSyncBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Syncing…';
      }
      setStatus('Syncing… uploading local changes and checking cloud updates.');

      try {
        const result = await original.apply(this, arguments);
        const status = text(byId('syncStatus')?.textContent);
        if (!status || /refreshing cloud data|data refreshed and synced/i.test(status)) {
          setStatus('Sync complete. This device is up to date.');
        }
        return result;
      } catch (error) {
        setStatus('Sync failed. Check internet, then try Sync Now again.');
        throw error;
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Sync Now';
        }
      }
    };

    wrapped.__fireSSimpleCloudWrapped = true;
    window.refreshSyncData = wrapped;
    try {
      refreshSyncData = wrapped;
    } catch (_) {}
  }

  function bindExportShortcut() {
    const exportBtn = byId('cloudExportBackupBtn');
    if (!exportBtn || exportBtn.__fireSSimpleCloudBound) return;
    exportBtn.__fireSSimpleCloudBound = true;
    exportBtn.addEventListener('click', () => {
      const adminExport = byId('adminExportBackupBtn');
      if (adminExport) {
        adminExport.click();
        return;
      }
      try {
        if (typeof window.exportBackup === 'function') window.exportBackup();
      } catch (_) {}
    });
  }

  function wrapUpdateSyncUi() {
    if (typeof window.updateSyncUI !== 'function') return;
    if (window.updateSyncUI.__fireSSimpleCloudWrapped) return;

    const original = window.updateSyncUI;
    const wrapped = async function fireSSimpleUpdateSyncUI() {
      const result = await original.apply(this, arguments);
      await applySimpleCloudUi();
      return result;
    };
    wrapped.__fireSSimpleCloudWrapped = true;
    window.updateSyncUI = wrapped;
    try {
      updateSyncUI = wrapped;
    } catch (_) {}
  }

  function wrapShowSyncTools() {
    if (typeof window.showSyncTools !== 'function') return;
    if (window.showSyncTools.__fireSSimpleCloudWrapped) return;

    const original = window.showSyncTools;
    const wrapped = function fireSSimpleShowSyncTools() {
      // Only real admins should open advanced tools.
      let email = '';
      try {
        email = text(window.currentUserProfile?.email);
      } catch (_) {}
      if (!canSeeAdvancedTools(email) && actualRole() !== 'super_admin') {
        alert('Advanced tools are only available to Fire-S admins.');
        hideAdvancedPanels();
        return;
      }
      return original.apply(this, arguments);
    };
    wrapped.__fireSSimpleCloudWrapped = true;
    window.showSyncTools = wrapped;
    try {
      showSyncTools = wrapped;
    } catch (_) {}
  }

  function init() {
    wrapRefreshMessages();
    wrapUpdateSyncUi();
    wrapShowSyncTools();
    bindExportShortcut();
    bindCloudDropdownPlacement();
    simplifyLabels();
    applySimpleCloudUi();
  }

  window.fireSApplySimpleCloudSync = applySimpleCloudUi;
  window.fireSPlaceCloudDropdown = placeCloudDropdown;
  window.fireSCloudDropdownBox = cloudDropdownBox;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  [300, 1000, 2500].forEach(ms => setTimeout(applySimpleCloudUi, ms));

  try {
    const client = window.supabaseClient;
    if (client?.auth?.onAuthStateChange) {
      client.auth.onAuthStateChange(() => {
        setTimeout(applySimpleCloudUi, 50);
        setTimeout(applySimpleCloudUi, 400);
      });
    }
  } catch (_) {}
})();
