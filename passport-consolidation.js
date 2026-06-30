
/* Fire-S v104.4 Passport Consolidation Stable */

(function () {
  let alreadyMovedForProject = '';

  function $(id) {
    return document.getElementById(id);
  }

  function currentId() {
    return typeof currentProjectId !== 'undefined' ? currentProjectId || '' : '';
  }

  function moveActionsIntoPassport() {
    const passport = $('fireSBuildingPassportV104Wrapper');
    const actionRegister = document.querySelector('.fire-s-action-register-v1033');

    if (!passport || !actionRegister) return;

    let slot = $('fireSPassportActionsSlotV1043');

    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'fireSPassportActionsSlotV1043';
      slot.className = 'fire-s-passport-actions-slot-v1043';

      const passportCard =
        passport.querySelector('.fire-s-building-passport-v104') ||
        passport.firstElementChild ||
        passport;

      passportCard.appendChild(slot);
    }

    if (actionRegister.parentElement !== slot) {
      slot.appendChild(actionRegister);
    }

    actionRegister.classList.add('fire-s-action-register-integrated-v1043');
  }

  function hideDuplicateWorkspace() {
    const oldWorkspace = $('fireSPremisesWorkspaceLiteV101');
    if (!oldWorkspace) return;

    oldWorkspace.classList.add('fire-s-hidden-duplicate-workspace-v1043');
    oldWorkspace.setAttribute('aria-hidden', 'true');
  }

  function improveBackButtonSpacing() {
    const form = $('projectFormSection');
    if (!form) return;

    Array.from(form.querySelectorAll('button'))
      .filter(button => String(button.textContent || '').trim().toLowerCase() === 'back to projects')
      .forEach(button => button.classList.add('fire-s-back-button-v1043'));
  }

  function run(force = false) {
    const form = $('projectFormSection');
    if (!form || form.style.display === 'none') return;

    const id = currentId();

    hideDuplicateWorkspace();
    improveBackButtonSpacing();

    // Move the action register only when opening/switching premises or if forced.
    if (force || alreadyMovedForProject !== id) {
      moveActionsIntoPassport();
      alreadyMovedForProject = id;
    }
  }

  window.FireSPassportConsolidation = {
    run,
    moveActionsIntoPassport,
    hideDuplicateWorkspace
  };

  setTimeout(() => run(true), 900);
  setTimeout(() => run(true), 1600);

  document.addEventListener('click', event => {
    if (
      event.target?.closest?.('.project-open-btn') ||
      event.target?.closest?.('[onclick*="openProject"]') ||
      event.target?.closest?.('[onclick*="editProject"]')
    ) {
      setTimeout(() => run(true), 500);
    }
  });

  window.addEventListener('fireSProjectOpened', () => setTimeout(() => run(true), 250));
})();
