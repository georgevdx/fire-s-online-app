
/* Fire-S v104.3 Passport Consolidation
   Removes duplicate workspace/passport blocks and makes the Building Passport the single premises header.
*/

(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function moveActionsIntoPassport() {
    const passport =
      $('fireSBuildingPassportV104Wrapper');

    const actionRegister =
      document.querySelector('.fire-s-action-register-v1033');

    const actionPanel =
      $('fireSActionRegisterPanelV1033');

    if (!passport || !actionRegister) return;

    let slot =
      $('fireSPassportActionsSlotV1043');

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

    if (actionPanel) {
      actionPanel.dataset.filter =
        actionPanel.dataset.filter || 'open';
    }
  }

  function hideDuplicateWorkspace() {
    const oldWorkspace =
      $('fireSPremisesWorkspaceLiteV101');

    if (!oldWorkspace) return;

    oldWorkspace.classList.add('fire-s-hidden-duplicate-workspace-v1043');
    oldWorkspace.setAttribute('aria-hidden', 'true');
  }

  function wirePassportTabs() {
    document
      .querySelectorAll('.fire-s-passport-tabs-v104 [data-scroll-target]')
      .forEach(button => {
        if (button.dataset.fireSV1043Bound === 'true') return;
        button.dataset.fireSV1043Bound = 'true';

        button.addEventListener('click', () => {
          document
            .querySelectorAll('.fire-s-passport-tabs-v104 button')
            .forEach(tab => tab.classList.remove('active'));

          button.classList.add('active');

          const target =
            $(button.dataset.scrollTarget);

          if (target) {
            target.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
        });
      });

    document
      .querySelectorAll('.fire-s-passport-tabs-v104 [data-passport-tab="overview"]')
      .forEach(button => {
        if (button.dataset.fireSV1043Bound === 'true') return;
        button.dataset.fireSV1043Bound = 'true';

        button.addEventListener('click', () => {
          document
            .querySelectorAll('.fire-s-passport-tabs-v104 button')
            .forEach(tab => tab.classList.remove('active'));

          button.classList.add('active');

          $('fireSBuildingPassportV104Wrapper')
            ?.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
        });
      });
  }

  function improveBackButtonSpacing() {
    const form =
      $('projectFormSection');

    if (!form) return;

    const backButtons =
      Array.from(form.querySelectorAll('button'))
        .filter(button =>
          String(button.textContent || '').trim().toLowerCase() === 'back to projects'
        );

    backButtons.forEach(button => {
      button.classList.add('fire-s-back-button-v1043');
    });
  }

  function run() {
    const form =
      $('projectFormSection');

    if (!form || form.style.display === 'none') return;

    hideDuplicateWorkspace();
    moveActionsIntoPassport();
    wirePassportTabs();
    improveBackButtonSpacing();
  }

  window.FireSPassportConsolidation = {
    run,
    moveActionsIntoPassport,
    hideDuplicateWorkspace
  };

  setTimeout(run, 500);
  setTimeout(run, 1200);
  setInterval(run, 2200);
})();
