/* Fire-S screen lock
   Keep Inspection Gateway and Home/Executive Command Centre from swapping
   while background sync refreshes data. */
(function fireSScreenLock() {
  'use strict';

  if (window.__fireSScreenLock) return;
  window.__fireSScreenLock = true;

  const WORKSPACE_IDS = [
    'homeSection',
    'projectListSection',
    'projectFormSection',
    'servicesSection',
    'findingsCentreSection',
    'companyTeamSection',
    'companyLetterheadSection',
    'testSamplesSection',
    'inspectorBoardSection',
    'userManualSection',
    'managementDashboardSection',
    'reportSection'
  ];

  function byId(id) {
    return document.getElementById(id);
  }

  function isShown(el) {
    if (!el) return false;
    if (el.hidden) return false;
    if (el.style && el.style.display === 'none') return false;
    try {
      const style = window.getComputedStyle(el);
      if (!style) return true;
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    } catch (_) {}
    return true;
  }

  function visibleWorkspaceId() {
    for (let i = 0; i < WORKSPACE_IDS.length; i += 1) {
      const id = WORKSPACE_IDS[i];
      if (isShown(byId(id))) return id;
    }
    return null;
  }

  function recoverHomeIfBlank() {
    if (visibleWorkspaceId()) return false;

    document.body.classList.remove(
      'fire-s-premises-render-lock',
      'fire-s-away-from-home',
      'fire-s-filling-inspection'
    );

    WORKSPACE_IDS.forEach(id => {
      if (id === 'homeSection') return;
      const el = byId(id);
      if (!el) return;
      el.style.display = 'none';
    });

    const home = byId('homeSection');
    if (home) {
      home.hidden = false;
      home.style.display = 'block';
      home.style.visibility = '';
      home.style.opacity = '';
      home.style.pointerEvents = '';
      home.removeAttribute('aria-hidden');
    }

    const command = byId('mainCommandCentre');
    if (command) {
      command.hidden = false;
      command.style.removeProperty('display');
      command.style.visibility = '';
      command.style.opacity = '';
      command.style.pointerEvents = '';
      command.removeAttribute('aria-hidden');
    }

    return true;
  }

  function activeWorkspace() {
    if (isShown(byId('projectFormSection'))) return 'form';
    if (isShown(byId('projectListSection'))) return 'gateway';
    if (isShown(byId('testSamplesSection'))) return 'test-samples';
    if (isShown(byId('userManualSection'))) return 'user-manual';
    if (isShown(byId('managementDashboardSection'))) return 'management-dashboard';
    if (isShown(byId('companyLetterheadSection'))) return 'company-details';
    if (isShown(byId('companyTeamSection'))) return 'team';
    if (isShown(byId('inspectorBoardSection'))) return 'inspectors';
    if (isShown(byId('servicesSection'))) return 'services';
    if (isShown(byId('findingsCentreSection'))) return 'findings';
    if (isShown(byId('reportSection'))) return 'report';
    return 'home';
  }

  function applyLock() {
    const space = activeWorkspace();
    const away = space !== 'home';
    const onGateway = space === 'gateway' || space === 'form';
    const filling = space === 'form';
    const lockOn = document.body.classList.contains('fire-s-premises-render-lock');
    const awayOn = document.body.classList.contains('fire-s-away-from-home');
    const fillingOn = document.body.classList.contains('fire-s-filling-inspection');

    if (lockOn !== onGateway) {
      document.body.classList.toggle('fire-s-premises-render-lock', onGateway);
    }
    if (awayOn !== away) {
      document.body.classList.toggle('fire-s-away-from-home', away);
    }
    if (fillingOn !== filling) {
      document.body.classList.toggle('fire-s-filling-inspection', filling);
    }

    const command = byId('mainCommandCentre');
    const home = byId('homeSection');
    const extraDash = byId('fireSExecutiveDashboard1115');

    if (onGateway) {
      if (command) command.setAttribute('aria-hidden', 'true');
      if (home) home.setAttribute('aria-hidden', 'true');
      if (extraDash) extraDash.style.setProperty('display', 'none', 'important');
    } else {
      if (command) command.removeAttribute('aria-hidden');
      if (home) home.removeAttribute('aria-hidden');
    }

    if (filling) hidePremisesDashboardChrome();
    recoverHomeIfBlank();
  }

  function hidePremisesDashboardChrome() {
    restoreActionRegisterForFill();
    [
      'fireSPremisesWorkspaceV105',
      'fireSBuildingPassportV104Wrapper',
      'fireSPremisesWorkspaceModule1113',
      'fireSPremisesWorkspaceLiteV101',
      'fireSBuildingHealthCentre',
      'fireSBuildingHealthCentre1114'
    ].forEach(id => {
      const el = byId(id);
      if (el) el.remove();
    });
  }

  function restoreActionRegisterForFill() {
    const register = document.querySelector('.fire-s-action-register-v1033');
    if (!register) return;
    const trapped = register.closest(
      '#fireSPremisesWorkspaceV105, #fireSBuildingPassportV104Wrapper, #fireSWorkspaceActionsSlotV105, #fireSPassportActionsSlotV1043'
    );
    if (!trapped) return;

    const form = byId('projectFormSection');
    const after =
      byId('checklist') ||
      byId('checklistCard') ||
      byId('projectDetailsCard') ||
      form;
    if (!after) return;
    after.insertAdjacentElement(after === form ? 'beforeend' : 'afterend', register);
    register.classList.remove(
      'fire-s-action-register-v105-integrated',
      'fire-s-action-register-integrated-v1043'
    );
  }

  function skipHomePaint() {
    const space = activeWorkspace();
    return space === 'gateway' || space === 'form';
  }

  function wrap(name, factory) {
    const original = window[name];
    if (typeof original !== 'function' || original.__fireSScreenLock) return;
    const wrapped = factory(original);
    wrapped.__fireSScreenLock = true;
    window[name] = wrapped;
    try {
      window.eval(name + ' = window.' + name + ';');
    } catch (_) {}
  }

  wrap('showProjectList', original => function fireSShowProjectListLocked() {
    document.body.classList.add('fire-s-premises-render-lock');
    const result = original.apply(this, arguments);
    applyLock();
    requestAnimationFrame(applyLock);
    setTimeout(applyLock, 80);
    return result;
  });

  wrap('showProjectForm', original => function fireSShowProjectFormLocked() {
    document.body.classList.add('fire-s-premises-render-lock');
    const result = original.apply(this, arguments);
    applyLock();
    return result;
  });

  wrap('showHome', original => function fireSShowHomeUnlocked() {
    document.body.classList.remove(
      'fire-s-premises-render-lock',
      'fire-s-away-from-home',
      'fire-s-filling-inspection'
    );
    WORKSPACE_IDS.forEach(id => {
      if (id === 'homeSection') return;
      const el = byId(id);
      if (el) el.style.display = 'none';
    });
    const home = byId('homeSection');
    if (home) {
      home.hidden = false;
      home.style.display = 'block';
      home.style.visibility = '';
      home.style.opacity = '';
      home.style.pointerEvents = '';
      home.removeAttribute('aria-hidden');
    }
    const result = original.apply(this, arguments);
    applyLock();
    recoverHomeIfBlank();
    return result;
  });

  wrap('renderHomeCommandCentre', original => function fireSRenderHomeIfVisible() {
    if (skipHomePaint()) {
      applyLock();
      return;
    }
    const result = original.apply(this, arguments);
    applyLock();
    return result;
  });

  wrap('fireSApplyCleanHomeRoles', original => function fireSApplyCleanHomeIfVisible() {
    if (skipHomePaint()) {
      applyLock();
      return;
    }
    return original.apply(this, arguments);
  });

  wrap('refreshSyncData', original => function fireSRefreshSyncWithoutLayerSwap() {
    const result = original.apply(this, arguments);
    return Promise.resolve(result).then(value => {
      applyLock();
      recoverHomeIfBlank();
      return value;
    });
  });

  wrap('runBackgroundSync', original => function fireSBackgroundSyncKeepScreen() {
    const result = original.apply(this, arguments);
    return Promise.resolve(result).then(value => {
      applyLock();
      recoverHomeIfBlank();
      return value;
    });
  });

  if (typeof window.fireSRenderExecutiveDashboard1115 === 'function' &&
      !window.fireSRenderExecutiveDashboard1115.__fireSScreenLock) {
    const originalDash = window.fireSRenderExecutiveDashboard1115;
    const wrappedDash = function fireSHideDuplicateExecutiveDashboard() {
      if (document.body.classList.contains('fire-s-clean-home') || skipHomePaint()) {
        const el = byId('fireSExecutiveDashboard1115');
        if (el) el.style.setProperty('display', 'none', 'important');
        return;
      }
      return originalDash.apply(this, arguments);
    };
    wrappedDash.__fireSScreenLock = true;
    window.fireSRenderExecutiveDashboard1115 = wrappedDash;
  }

  if (window.FireSExecutiveMiniDashboard &&
      typeof window.FireSExecutiveMiniDashboard.refresh === 'function' &&
      !window.FireSExecutiveMiniDashboard.refresh.__fireSScreenLock) {
    const originalSnap = window.FireSExecutiveMiniDashboard.refresh;
    const wrappedSnap = function fireSSnapshotOnlyOnGateway() {
      if (!isShown(byId('projectListSection'))) return;
      return originalSnap.apply(this, arguments);
    };
    wrappedSnap.__fireSScreenLock = true;
    window.FireSExecutiveMiniDashboard.refresh = wrappedSnap;
  }

  const observer = new MutationObserver(() => {
    if (observer.__fireSTimer) clearTimeout(observer.__fireSTimer);
    observer.__fireSTimer = setTimeout(applyLock, 40);
  });

  function startObserver() {
    if (!document.body) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'hidden', 'class']
    });
    applyLock();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) recoverHomeIfBlank();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }

  window.fireSApplyScreenLock = applyLock;
  window.fireSRecoverHomeIfBlank = recoverHomeIfBlank;
  window.fireSIsFillingInspection = function fireSIsFillingInspection() {
    return activeWorkspace() === 'form';
  };
  window.fireSHidePremisesDashboardChrome = hidePremisesDashboardChrome;
})();
