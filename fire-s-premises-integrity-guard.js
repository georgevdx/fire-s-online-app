/* ============================================================
   FIRE-S PREMISES INTEGRITY GUARD v1.3
   Visible premises-name uniqueness only.
   Fixes false positives caused by legacy/internal siteName values.
   Load AFTER app.js.
   ============================================================ */
(function () {
  'use strict';

  const VERSION = '1.3.0';
  const STORAGE_KEY = 'fireyeProjects';
  const ERROR_CODE = 'FIRE_S_PREMISES_INTEGRITY_BLOCK';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalize(value) {
    return clean(value)
      .toLocaleLowerCase()
      .replace(/[‐‑‒–—―]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /*
   * IMPORTANT:
   * Fire-S displays/uses projectName as the premises identity.
   * Do NOT compare siteName independently here. Legacy records can contain
   * stale siteName values which do not match the visible premises name.
   */
  function premisesName(project) {
    const projectName = clean(project?.projectName);
    if (projectName) return projectName;

    // Fallback only for genuinely legacy records with no projectName at all.
    return clean(
      [project?.organisationName, project?.siteName]
        .map(clean)
        .filter(Boolean)
        .join(' ')
    );
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
    return (list || []).find(
      p => String(p?.id || '') === String(id || '')
    ) || null;
  }

  function nameChanged(oldProject, newProject) {
    if (!oldProject) return true;
    return normalize(premisesName(oldProject)) !== normalize(premisesName(newProject));
  }

  function isNewOrRenamed(project, oldList) {
    const previous = projectById(oldList, project?.id);
    return !previous || nameChanged(previous, project);
  }

  function duplicateFor(candidate, proposed) {
    const candidateName = normalize(premisesName(candidate));
    if (!candidateName) return null;

    return (proposed || []).find(other => {
      if (!other || other === candidate) return false;

      if (
        candidate?.id &&
        other?.id &&
        String(other.id) === String(candidate.id)
      ) {
        return false;
      }

      if (companyKey(other) !== companyKey(candidate)) return false;

      return normalize(premisesName(other)) === candidateName;
    }) || null;
  }

  function focusPremisesField(candidate) {
    const scheduled =
      candidate?.scheduleType === 'new_site' ||
      candidate?.scheduledStatus === 'scheduled';

    const ids = scheduled
      ? ['scheduleSiteName', 'scheduleOrganisationName']
      : ['siteName', 'organisationName'];

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

  function warning(candidate, existing) {
    const attempted = premisesName(candidate) || 'Unnamed premises';
    const existingName = premisesName(existing) || 'Existing premises';

    alert(
      'Premises name already exists\n\n' +
      `"${attempted}" already exists as a premises in this company.\n\n` +
      'If this is the same premises, open the existing record. ' +
      'If it is a different branch or location, give it a unique name, ' +
      'for example "Checkers Menlyn".'
    );

    focusPremisesField(candidate);
  }

  function integrityError(name) {
    const error = new Error(`Duplicate premises blocked: ${name}`);
    error.code = ERROR_CODE;
    error.fireSIntegrityBlock = true;
    return error;
  }

  function validateProposedWrite(proposedProjects) {
    const previousProjects = storedProjects();
    const proposed = Array.isArray(proposedProjects) ? proposedProjects : [];

    /*
     * Only validate newly introduced premises names or renamed premises.
     * Existing historical data remains usable.
     */
    for (const candidate of proposed) {
      if (!candidate || !isNewOrRenamed(candidate, previousProjects)) continue;

      const candidateName = premisesName(candidate);
      if (!normalize(candidateName)) continue;

      const duplicate = duplicateFor(candidate, proposed);
      if (!duplicate) continue;

      warning(candidate, duplicate);
      throw integrityError(candidateName);
    }

    return true;
  }

  function install() {
    let original = null;

    try {
      original =
        window.setProjects ||
        (typeof setProjects === 'function' ? setProjects : null);
    } catch (_) {
      original = window.setProjects;
    }

    if (typeof original !== 'function') {
      console.error('[Fire-S Integrity v1.3] setProjects() not found.');
      return false;
    }

    if (original.__fireSPremisesIntegrityV13) {
      return true;
    }

    // If replacing an older guard, unwrap to the original Fire-S setProjects.
    while (original && original.__fireSOriginal) {
      original = original.__fireSOriginal;
    }

    function protectedSetProjects(projects) {
      validateProposedWrite(projects);
      return original.call(this, projects);
    }

    protectedSetProjects.__fireSPremisesIntegrityV13 = true;
    protectedSetProjects.__fireSOriginal = original;

    window.setProjects = protectedSetProjects;

    try {
      setProjects = protectedSetProjects;
    } catch (_) {}

    console.info(
      `[Fire-S] Premises Integrity Guard ${VERSION} active — projectName only.`
    );

    return true;
  }

  install();
  [100, 500, 1500].forEach(delay => setTimeout(install, delay));

  window.addEventListener('error', event => {
    const error = event?.error;

    if (
      error?.fireSIntegrityBlock ||
      error?.code === ERROR_CODE
    ) {
      event.preventDefault();
      console.warn('[Fire-S Integrity] Duplicate write stopped:', error.message);
    }
  });

  window.FireSPremisesIntegrityGuard = {
    version: VERSION,
    install,
    validateProposedWrite,
    premisesName,
    normalize
  };
})();
