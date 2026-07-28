/* ============================================================
   FIRE-S PREMISES INTEGRITY GUARD v1.2
   Central write-gate protection.
   Load AFTER app.js.
   ============================================================ */
(function () {
  'use strict';

  const VERSION = '1.2.0';
  const STORAGE_KEY = 'fireyeProjects';
  const ERROR_CODE = 'FIRE_S_PREMISES_INTEGRITY_BLOCK';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalize(value) {
    return clean(value)
      .toLocaleLowerCase()
      .replace(/[‐‑‒–—―]/g, '-')
      .replace(/[.,]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function displayName(project) {
    return clean(
      project?.projectName ||
      [project?.organisationName, project?.siteName].filter(Boolean).join(' ') ||
      project?.siteName ||
      project?.organisationName
    );
  }

  function siteName(project) {
    return clean(project?.siteName || project?.projectName || '');
  }

  function companyKey(project) {
    return clean(project?.companyId || project?.company_id || '__local_company__');
  }

  function storedProjects() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function projectById(list, id) {
    return (list || []).find(p => String(p?.id || '') === String(id || '')) || null;
  }

  function sameIdentityName(a, b) {
    const aSite = normalize(siteName(a));
    const bSite = normalize(siteName(b));
    const aFull = normalize(displayName(a));
    const bFull = normalize(displayName(b));

    // Site/premises name is the strongest uniqueness key.
    if (aSite && bSite && aSite === bSite) return true;

    // Fallback for records that only have projectName.
    if (aFull && bFull && aFull === bFull) return true;

    return false;
  }

  function duplicateOf(candidate, proposed) {
    return (proposed || []).find(other => {
      if (!other || other === candidate) return false;
      if (String(other.id || '') === String(candidate.id || '')) return false;
      if (companyKey(other) !== companyKey(candidate)) return false;
      return sameIdentityName(candidate, other);
    }) || null;
  }

  function changedName(oldProject, newProject) {
    if (!oldProject) return true;
    return (
      normalize(siteName(oldProject)) !== normalize(siteName(newProject)) ||
      normalize(displayName(oldProject)) !== normalize(displayName(newProject))
    );
  }

  function isNewOrRenamed(project, oldList) {
    const oldProject = projectById(oldList, project?.id);
    return !oldProject || changedName(oldProject, project);
  }

  function focusBestNameField(project) {
    const scheduleLikely =
      project?.scheduleType === 'new_site' ||
      project?.scheduledStatus === 'scheduled';

    const ids = scheduleLikely
      ? ['scheduleSiteName', 'scheduleOrganisationName', 'siteName', 'organisationName']
      : ['siteName', 'organisationName', 'scheduleSiteName', 'scheduleOrganisationName'];

    for (const id of ids) {
      const field = document.getElementById(id);
      if (!field) continue;
      try {
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => field.focus({ preventScroll: true }), 150);
      } catch (_) {
        try { field.focus(); } catch (_) {}
      }
      break;
    }
  }

  function warnDuplicate(candidate, existing) {
    const attempted = displayName(candidate) || siteName(candidate) || 'This premises';
    const existingName = displayName(existing) || siteName(existing) || 'Existing premises';

    alert(
      'Premises name already exists\n\n' +
      `"${attempted}" cannot be saved because "${existingName}" already exists.\n\n` +
      'Open the existing premises if it is the same location. ' +
      'If this is another branch or site, add the branch, suburb, building or area ' +
      'to make the premises name unique, for example "Checkers Menlyn".'
    );

    focusBestNameField(candidate);
  }

  function makeIntegrityError(message) {
    const error = new Error(message);
    error.code = ERROR_CODE;
    error.fireSIntegrityBlock = true;
    return error;
  }

  function validateProposedWrite(proposed) {
    const oldList = storedProjects();
    const newList = Array.isArray(proposed) ? proposed : [];

    /*
      Only examine records that are NEW or whose identity name was changed.
      This is important because old installations may already contain historical
      duplicates. Normal saves/syncs on unchanged records must continue working.
    */
    for (const candidate of newList) {
      if (!candidate || !isNewOrRenamed(candidate, oldList)) continue;

      const candidateName = siteName(candidate) || displayName(candidate);
      if (!normalize(candidateName)) continue;

      const duplicate = duplicateOf(candidate, newList);
      if (!duplicate) continue;

      warnDuplicate(candidate, duplicate);

      throw makeIntegrityError(
        `Duplicate premises blocked: ${displayName(candidate) || candidateName}`
      );
    }

    return true;
  }

  function install() {
    const original =
      window.setProjects ||
      (typeof setProjects === 'function' ? setProjects : null);

    if (typeof original !== 'function') {
      console.error('[Fire-S Integrity v1.2] setProjects() was not found.');
      return false;
    }

    if (original.__fireSPremisesIntegrityV12) {
      return true;
    }

    function protectedSetProjects(projects) {
      validateProposedWrite(projects);
      return original.call(this, projects);
    }

    protectedSetProjects.__fireSPremisesIntegrityV12 = true;
    protectedSetProjects.__fireSOriginal = original;

    /*
      In a classic browser script, top-level function declarations are global
      bindings backed by window properties. Assigning both covers the live app.
    */
    window.setProjects = protectedSetProjects;
    try {
      setProjects = protectedSetProjects;
    } catch (_) {
      // window assignment is sufficient on standard Fire-S deployment.
    }

    console.info(`[Fire-S] Premises Integrity Guard ${VERSION} installed at setProjects().`);
    return true;
  }

  // Install after app.js and retry in case app initialisation is still completing.
  install();
  [100, 500, 1500].forEach(delay => {
    window.setTimeout(install, delay);
  });

  /*
    Prevent our intentional block from being mistaken for an app crash in the UI.
    The thrown error is deliberate: it aborts the caller immediately so a rejected
    scheduled project cannot continue to uploadSingleInspection().
  */
  window.addEventListener('error', event => {
    const err = event?.error;
    if (err?.fireSIntegrityBlock || err?.code === ERROR_CODE) {
      event.preventDefault();
      console.warn('[Fire-S Integrity] Save route stopped:', err.message);
    }
  });

  window.FireSPremisesIntegrityGuard = {
    version: VERSION,
    install,
    validateProposedWrite,
    normalize
  };
})();
