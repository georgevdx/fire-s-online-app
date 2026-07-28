/* ============================================================
   FIRE-S PREMISES INTEGRITY GUARD v1.5
   Fixes:
   - Current premises is correctly excluded from duplicate matching
   - Live suggestions render only under the premises/site field
   - No floating/stray comparison box in Building Health
   - Warning only fires for a true exact duplicate
   - Save/Close/Finish remain hard-blocked only while exact duplicate exists
   Load AFTER app.js.
   ============================================================ */
(function () {
  'use strict';

  const VERSION = '1.5.0';
  const STORAGE_KEY = 'fireyeProjects';
  const ERROR_CODE = 'FIRE_S_PREMISES_INTEGRITY_BLOCK';

  let duplicateLock = {
    inspection: false,
    schedule: false
  };

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

  function premisesName(project) {
    const projectName = clean(project?.projectName);
    if (projectName) return projectName;

    return clean(
      [project?.organisationName, project?.siteName]
        .map(clean)
        .filter(Boolean)
        .join(' ')
    );
  }

  function field(id) {
    return document.getElementById(id);
  }

  function val(id) {
    return clean(field(id)?.value);
  }

  function getCurrentProjectIdSafe() {
    // IMPORTANT: do not use a function name that shadows the global variable.
    if (window.currentProjectId) {
      return String(window.currentProjectId);
    }

    if (window.currentProject && window.currentProject.id) {
      return String(window.currentProject.id);
    }

    // Try common Fire-S globals safely through window only.
    const possible = [
      window.activeProjectId,
      window.currentInspectionId,
      window.editingProjectId
    ].find(Boolean);

    return possible ? String(possible) : '';
  }

  function activeCompanyId() {
    try {
      if (typeof window.getAccessMetadata === 'function') {
        return clean(window.getAccessMetadata()?.companyId);
      }
    } catch (_) {}

    return clean(
      window.currentCompanyAccess?.companyId ||
      window.currentUserProfile?.companyId ||
      window.currentProject?.companyId
    );
  }

  function companyKey(project) {
    return clean(project?.companyId || project?.company_id || '__local_company__');
  }

  function sameCompany(project) {
    const active = activeCompanyId();
    if (!active) return true;
    return companyKey(project) === active;
  }

  function storedProjects() {
    try {
      if (typeof window.getProjects === 'function') {
        const list = window.getProjects();
        if (Array.isArray(list)) return list;
      }
    } catch (_) {}

    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function enteredName(mode) {
    if (mode === 'schedule') {
      const org = val('scheduleOrganisationName');
      const site = val('scheduleSiteName');
      return clean([org, site].filter(Boolean).join(' '));
    }

    const org = val('organisationName');
    const site = val('siteName');
    return clean([org, site].filter(Boolean).join(' '));
  }

  function siteInput(mode) {
    return mode === 'schedule'
      ? (field('scheduleSiteName') || field('scheduleOrganisationName'))
      : (field('siteName') || field('organisationName'));
  }

  function existingNames(mode) {
    const editingId = mode === 'inspection' ? getCurrentProjectIdSafe() : '';

    return storedProjects()
      .filter(project => project && sameCompany(project))
      .filter(project => {
        if (!editingId) return true;
        return String(project?.id || '') !== editingId;
      })
      .map(project => ({
        project,
        name: premisesName(project),
        key: normalize(premisesName(project))
      }))
      .filter(item => item.key);
  }

  function exactDuplicate(mode) {
    const key = normalize(enteredName(mode));
    if (!key) return null;
    return existingNames(mode).find(item => item.key === key) || null;
  }

  function similarMatches(mode) {
    const typed = normalize(enteredName(mode));
    if (!typed || typed.length < 2) return [];

    const words = typed.split(' ').filter(Boolean);

    return existingNames(mode)
      .map(item => {
        let score = 0;

        if (item.key === typed) score = 100;
        else if (item.key.startsWith(typed)) score = 90;
        else if (item.key.includes(typed)) score = 80;
        else if (typed.includes(item.key)) score = 70;
        else {
          const matchedWords = words.filter(word => item.key.includes(word)).length;
          score = matchedWords ? 40 + matchedWords * 10 : 0;
        }

        return { ...item, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 6);
  }

  function escapeHtml(value) {
    return clean(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function suggestionBoxId(mode) {
    return `fire-s-name-compare-${mode}`;
  }

  function removeSuggestionBox(mode) {
    document.getElementById(suggestionBoxId(mode))?.remove();
  }

  function ensureSuggestionBox(mode) {
    const input = siteInput(mode);
    if (!input) return null;

    let box = document.getElementById(suggestionBoxId(mode));
    if (box) {
      // If the DOM moved during app redraw, rebuild in the correct place.
      if (box.previousElementSibling !== input) {
        box.remove();
        box = null;
      }
    }

    if (!box) {
      box = document.createElement('div');
      box.id = suggestionBoxId(mode);
      box.setAttribute('data-fire-s-integrity-ui', 'true');

      // Inline CSS isolates it from Fire-S card/menu styling.
      box.style.setProperty('display', 'none', 'important');
      box.style.setProperty('width', '100%', 'important');
      box.style.setProperty('box-sizing', 'border-box', 'important');
      box.style.setProperty('margin', '6px 0 8px 0', 'important');
      box.style.setProperty('padding', '8px 10px', 'important');
      box.style.setProperty('border', '1px solid #d0d5dd', 'important');
      box.style.setProperty('border-radius', '8px', 'important');
      box.style.setProperty('background', '#ffffff', 'important');
      box.style.setProperty('box-shadow', 'none', 'important');
      box.style.setProperty('position', 'static', 'important');
      box.style.setProperty('float', 'none', 'important');
      box.style.setProperty('clear', 'both', 'important');
      box.style.setProperty('min-height', '0', 'important');
      box.style.setProperty('height', 'auto', 'important');
      box.style.setProperty('font-size', '13px', 'important');
      box.style.setProperty('line-height', '1.35', 'important');
      box.style.setProperty('z-index', '1', 'important');

      input.insertAdjacentElement('afterend', box);
    }

    return box;
  }

  function renderSuggestions(mode) {
    const input = siteInput(mode);
    if (!input) {
      removeSuggestionBox(mode);
      duplicateLock[mode] = false;
      return;
    }

    const typed = clean(enteredName(mode));
    const exact = exactDuplicate(mode);
    const matches = similarMatches(mode);

    duplicateLock[mode] = Boolean(exact);

    if (!typed || typed.length < 2 || matches.length === 0) {
      removeSuggestionBox(mode);
      return;
    }

    const box = ensureSuggestionBox(mode);
    if (!box) return;

    const header = exact
      ? '<div style="font-weight:700;color:#b42318;margin-bottom:5px;">This premises name already exists</div>'
      : '<div style="font-weight:700;margin-bottom:5px;">Similar existing premises</div>';

    const rows = matches.map(item => {
      const isExact = item.key === normalize(typed);

      return `
        <div style="
          padding:5px 0;
          border-top:1px solid #eef1f5;
          ${isExact ? 'color:#b42318;font-weight:700;' : 'color:#344054;'}
        ">
          ${escapeHtml(item.name)}
          ${isExact ? ' — exact match' : ''}
        </div>
      `;
    }).join('');

    box.innerHTML = `
      ${header}
      ${rows}
      <div style="margin-top:6px;color:#667085;font-size:12px;">
        Similar names are shown for reference. Only an exact duplicate blocks saving.
      </div>
    `;

    box.style.setProperty('display', 'block', 'important');
  }

  function focusName(mode) {
    const input = siteInput(mode);
    if (!input) return;

    try {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => input.focus({ preventScroll: true }), 150);
    } catch (_) {
      try { input.focus(); } catch (_) {}
    }
  }

  let lastWarnedKey = '';

  function showDuplicateWarning(mode) {
    const duplicate = exactDuplicate(mode);
    if (!duplicate) return false;

    const key = `${mode}:${normalize(enteredName(mode))}`;

    // Avoid repeated alerts for the same unchanged name.
    if (lastWarnedKey === key) {
      focusName(mode);
      renderSuggestions(mode);
      return true;
    }

    lastWarnedKey = key;

    alert(
      'Premises name already exists\n\n' +
      `"${enteredName(mode)}" already exists in Fire-S.\n\n` +
      'This inspection cannot be saved, closed or finished until the premises name is unique. ' +
      'If it is the same location, use the existing premises. If it is a different branch or site, ' +
      'add the branch, suburb or area to the name.'
    );

    focusName(mode);
    renderSuggestions(mode);
    return true;
  }

  function refreshMode(mode) {
    const duplicate = exactDuplicate(mode);
    duplicateLock[mode] = Boolean(duplicate);

    // Reset alert memory as soon as the name changes away from previous duplicate.
    const currentKey = `${mode}:${normalize(enteredName(mode))}`;
    if (lastWarnedKey && lastWarnedKey !== currentKey) {
      lastWarnedKey = '';
    }

    renderSuggestions(mode);
  }

  document.addEventListener('input', event => {
    const id = event.target?.id;

    if (id === 'organisationName' || id === 'siteName') {
      refreshMode('inspection');
    }

    if (id === 'scheduleOrganisationName' || id === 'scheduleSiteName') {
      refreshMode('schedule');
    }
  }, true);

  document.addEventListener('change', event => {
    const id = event.target?.id;

    if (id === 'organisationName' || id === 'siteName') {
      refreshMode('inspection');
    }

    if (id === 'scheduleOrganisationName' || id === 'scheduleSiteName') {
      refreshMode('schedule');
    }
  }, true);

  function stop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function buttonMode(button) {
    const id = button?.id || '';
    const label = clean(
      button?.innerText ||
      button?.value ||
      button?.getAttribute?.('aria-label') ||
      button?.title
    ).toLocaleLowerCase();

    if (
      id === 'saveScheduledInspectionBtn' ||
      id === 'saveScheduleBtn' ||
      label.includes('save schedule')
    ) {
      return 'schedule';
    }

    const protectedLabels = ['save draft', 'save', 'close', 'finish inspection', 'finish', 'finalise', 'finalize'];

    if (protectedLabels.some(x => label === x || label.includes(x))) {
      return 'inspection';
    }

    return null;
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.(
      'button, input[type="button"], input[type="submit"], a'
    );
    if (!button) return;

    const mode = buttonMode(button);
    if (!mode) return;

    refreshMode(mode);

    if (!duplicateLock[mode]) return;

    showDuplicateWarning(mode);
    stop(event);
  }, true);

  function previousProjectsFromStorage() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function projectById(list, id) {
    return list.find(p => String(p?.id || '') === String(id || '')) || null;
  }

  function isNewOrRenamed(candidate, previous) {
    const old = projectById(previous, candidate?.id);
    if (!old) return true;
    return normalize(premisesName(old)) !== normalize(premisesName(candidate));
  }

  function duplicateInProposed(candidate, proposed) {
    const key = normalize(premisesName(candidate));
    if (!key) return null;

    return proposed.find(other => {
      if (!other || other === candidate) return false;

      if (
        candidate?.id &&
        other?.id &&
        String(candidate.id) === String(other.id)
      ) {
        return false;
      }

      if (companyKey(candidate) !== companyKey(other)) return false;

      return normalize(premisesName(other)) === key;
    }) || null;
  }

  function validateProposedWrite(proposedProjects) {
    const previous = previousProjectsFromStorage();
    const proposed = Array.isArray(proposedProjects) ? proposedProjects : [];

    for (const candidate of proposed) {
      if (!candidate || !isNewOrRenamed(candidate, previous)) continue;

      const dup = duplicateInProposed(candidate, proposed);
      if (!dup) continue;

      const name = premisesName(candidate);

      alert(
        'Premises name already exists\n\n' +
        `"${name}" already exists in Fire-S.\n\n` +
        'The duplicate record was not saved.'
      );

      const error = new Error(`Duplicate premises blocked: ${name}`);
      error.code = ERROR_CODE;
      error.fireSIntegrityBlock = true;
      throw error;
    }

    return true;
  }

  function installSetProjectsGuard() {
    let original = null;

    try {
      original =
        window.setProjects ||
        (typeof setProjects === 'function' ? setProjects : null);
    } catch (_) {
      original = window.setProjects;
    }

    if (typeof original !== 'function') return false;
    if (original.__fireSPremisesIntegrityV15) return true;

    while (original && original.__fireSOriginal) {
      original = original.__fireSOriginal;
    }

    function protectedSetProjects(projects) {
      validateProposedWrite(projects);
      return original.call(this, projects);
    }

    protectedSetProjects.__fireSPremisesIntegrityV15 = true;
    protectedSetProjects.__fireSOriginal = original;

    window.setProjects = protectedSetProjects;

    try {
      setProjects = protectedSetProjects;
    } catch (_) {}

    return true;
  }

  installSetProjectsGuard();
  [100, 500, 1500].forEach(delay =>
    setTimeout(installSetProjectsGuard, delay)
  );

  window.addEventListener('error', event => {
    const err = event?.error;
    if (err?.fireSIntegrityBlock || err?.code === ERROR_CODE) {
      event.preventDefault();
      console.warn('[Fire-S Integrity] Duplicate write stopped:', err.message);
    }
  });

  window.FireSPremisesIntegrityGuard = {
    version: VERSION,
    refreshInspection: () => refreshMode('inspection'),
    refreshSchedule: () => refreshMode('schedule'),
    getCurrentProjectIdSafe,
    normalize
  };

  console.info(`[Fire-S] Premises Integrity Guard ${VERSION} active.`);
})();
