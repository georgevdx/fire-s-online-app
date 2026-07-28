/* ============================================================
   Fire-S Premises Integrity Guard v1.0
   Purpose:
   - Require premises/site name and address before saving/closing/finalising
     a NEW premises.
   - Prevent duplicate premises names within the same company.
   - Apply to New Inspection and Schedule New Premises workflows.
   - Re-check at action time to protect all UI routes.
   ============================================================ */
(function FireSPremisesIntegrityGuard() {
  'use strict';

  const VERSION = '1.0.0';
  const WRAPPED_FLAG = '__fireSPremisesIntegrityWrapped';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function normaliseName(value) {
    return text(value)
      .toLocaleLowerCase()
      .replace(/[‐‑‒–—―]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function fieldValue(ids) {
    for (const id of ids) {
      const field = document.getElementById(id);
      if (field && text(field.value)) return text(field.value);
    }
    return '';
  }

  function getEnteredPremisesName() {
    const organisation = fieldValue([
      'organisationName',
      'organizationName',
      'companyName'
    ]);
    const site = fieldValue([
      'siteName',
      'premisesName',
      'projectName'
    ]);

    // Fire-S currently builds projectName from organisation + site.
    return text([organisation, site].filter(Boolean).join(' ')) || site || organisation;
  }

  function getEnteredAddress() {
    const streetNumber = fieldValue(['streetNumber']);
    const addressLine = fieldValue([
      'projectAddress',
      'addressLine',
      'premisesAddress',
      'siteAddress'
    ]);
    return text([streetNumber, addressLine].filter(Boolean).join(' '));
  }

  function getCurrentId() {
    return (
      window.currentProjectId ||
      (typeof currentProjectId !== 'undefined' ? currentProjectId : null) ||
      window.currentProject?.id ||
      null
    );
  }

  function projects() {
    try {
      if (typeof window.getProjects === 'function') {
        const result = window.getProjects();
        return Array.isArray(result) ? result : [];
      }
      if (typeof getProjects === 'function') {
        const result = getProjects();
        return Array.isArray(result) ? result : [];
      }
    } catch (error) {
      console.warn('[Fire-S Integrity] Could not read projects:', error);
    }
    return [];
  }

  function currentCompanyId() {
    return (
      window.currentCompanyAccess?.companyId ||
      window.currentUserProfile?.companyId ||
      window.currentProject?.companyId ||
      null
    );
  }

  function projectCompanyId(project) {
    return project?.companyId || project?.company_id || null;
  }

  function projectName(project) {
    return text(
      project?.projectName ||
      project?.premisesName ||
      [project?.organisationName, project?.siteName].filter(Boolean).join(' ')
    );
  }

  function isSameCompany(project) {
    const companyId = currentCompanyId();
    if (!companyId) return true; // Existing local single-company behaviour.
    return String(projectCompanyId(project) || '') === String(companyId);
  }

  function duplicateFor(name) {
    const key = normaliseName(name);
    if (!key) return null;

    const currentId = getCurrentId();

    return projects().find(project => {
      if (!project || !isSameCompany(project)) return false;
      if (currentId && String(project.id) === String(currentId)) return false;
      return normaliseName(projectName(project)) === key;
    }) || null;
  }

  function findField(ids) {
    return ids.map(id => document.getElementById(id)).find(Boolean) || null;
  }

  function focusField(field) {
    if (!field) return;
    try {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => field.focus({ preventScroll: true }), 250);
    } catch (_) {
      try { field.focus(); } catch (_) {}
    }
  }

  function warn(title, message, field) {
    alert(`${title}\n\n${message}`);
    focusField(field);
  }

  function validateNewPremises(options = {}) {
    const name = getEnteredPremisesName();
    const address = getEnteredAddress();

    const nameField = findField([
      'siteName',
      'premisesName',
      'projectName',
      'organisationName',
      'organizationName'
    ]);

    const addressField = findField([
      'projectAddress',
      'addressLine',
      'premisesAddress',
      'siteAddress',
      'streetNumber'
    ]);

    if (!name) {
      warn(
        'Premises details required',
        'Enter a premises name before saving, closing, scheduling or finalising this inspection.',
        nameField
      );
      return { ok: false, reason: 'missing-name' };
    }

    if (!address) {
      warn(
        'Premises details required',
        'Enter the premises address before saving, closing, scheduling or finalising this inspection.',
        addressField
      );
      return { ok: false, reason: 'missing-address' };
    }

    const duplicate = duplicateFor(name);
    if (duplicate) {
      const existingName = projectName(duplicate) || name;
      warn(
        'Premises name already exists',
        `A premises named "${existingName}" already exists. Open the existing premises if it is the same location, or add the branch, suburb, site or area to create a unique name, for example "Checkers Menlyn".`,
        nameField
      );
      return {
        ok: false,
        reason: 'duplicate-name',
        duplicate
      };
    }

    return { ok: true };
  }

  function looksLikeProtectedAction(element) {
    const button = element?.closest?.('button, input[type="button"], input[type="submit"], a');
    if (!button) return null;

    const label = text(
      button.innerText ||
      button.value ||
      button.getAttribute('aria-label') ||
      button.title
    ).toLocaleLowerCase();

    const protectedTerms = [
      'close',
      'save',
      'save draft',
      'finish',
      'finish inspection',
      'finalise',
      'finalize',
      'save schedule',
      'schedule inspection',
      'schedule new',
      'create schedule'
    ];

    return protectedTerms.some(term => label === term || label.includes(term))
      ? button
      : null;
  }

  // Capture phase means validation runs before existing click handlers.
  document.addEventListener('click', event => {
    const action = looksLikeProtectedAction(event.target);
    if (!action) return;

    const result = validateNewPremises({ source: 'click' });
    if (result.ok) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  // Protect form submission routes as well.
  document.addEventListener('submit', event => {
    const result = validateNewPremises({ source: 'submit' });
    if (result.ok) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  function wrapFunction(name) {
    let original;
    try {
      original = window[name] || eval(name);
    } catch (_) {
      original = window[name];
    }

    if (typeof original !== 'function' || original[WRAPPED_FLAG]) return false;

    const wrapped = function FireSPremisesIntegrityProtectedAction() {
      const result = validateNewPremises({ source: name });
      if (!result.ok) return false;
      return original.apply(this, arguments);
    };

    wrapped[WRAPPED_FLAG] = true;
    wrapped.__original = original;
    window[name] = wrapped;

    try { eval(`${name} = window.${name}`); } catch (_) {}
    return true;
  }

  const guardedFunctions = [
    'saveProject',
    'saveInspection',
    'saveDraft',
    'closeInspection',
    'closeProject',
    'finishInspection',
    'finaliseInspection',
    'finalizeInspection',
    'scheduleInspection',
    'saveSchedule',
    'createScheduledInspection',
    'createNewSiteSchedule'
  ];

  function installWrappers() {
    guardedFunctions.forEach(wrapFunction);
  }

  // Install immediately and again after app initialisation.
  installWrappers();
  [250, 1000, 2500].forEach(delay => window.setTimeout(installWrappers, delay));

  window.FireSPremisesIntegrityGuard = {
    version: VERSION,
    validate: validateNewPremises,
    normaliseName,
    findDuplicate: duplicateFor,
    reinstall: installWrappers
  };

  console.info(`[Fire-S] Premises Integrity Guard ${VERSION} active.`);
})();
