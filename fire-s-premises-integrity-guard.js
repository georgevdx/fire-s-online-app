/* ============================================================
   FIRE-S PREMISES INTEGRITY GUARD v1.4
   - Live existing-premises suggestions while typing
   - Hard lock on Save / Close / Finish / Schedule while duplicate exists
   - Central setProjects() write gate
   Load AFTER app.js.
   ============================================================ */
(function () {
  'use strict';

  const VERSION = '1.4.0';
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

  function companyKey(project) {
    return clean(project?.companyId || project?.company_id || '__local_company__');
  }

  function activeCompanyId() {
    try {
      if (typeof getAccessMetadata === 'function') {
        return clean(getAccessMetadata()?.companyId);
      }
    } catch (_) {}

    return clean(
      window.currentCompanyAccess?.companyId ||
      window.currentUserProfile?.companyId ||
      window.currentProject?.companyId
    );
  }

  function storedProjects() {
    try {
      if (typeof getProjects === 'function') {
        const list = getProjects();
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

  function currentProjectId() {
    try {
      if (typeof window.currentProjectId !== 'undefined' && window.currentProjectId) {
        return String(window.currentProjectId);
      }
    } catch (_) {}

    try {
      if (typeof currentProjectId !== 'undefined' && currentProjectId) {
        return String(currentProjectId);
      }
    } catch (_) {}

    return String(window.currentProject?.id || '');
  }

  function field(id) {
    return document.getElementById(id);
  }

  function val(id) {
    return clean(field(id)?.value);
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

  function nameInput(mode) {
    if (mode === 'schedule') {
      return field('scheduleSiteName') || field('scheduleOrganisationName');
    }
    return field('siteName') || field('organisationName');
  }

  function sameCompany(project) {
    const active = activeCompanyId();
    if (!active) return true;
    return companyKey(project) === active;
  }

  function existingNames(mode) {
    const editingId = mode === 'inspection' ? currentProjectId() : '';

    return storedProjects()
      .filter(project => project && sameCompany(project))
      .filter(project => !editingId || String(project.id || '') !== editingId)
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

  function fuzzyMatches(mode) {
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
      .slice(0, 8);
  }

  function suggestionId(mode) {
    return `fire-s-premises-name-suggestions-${mode}`;
  }

  function ensureSuggestionBox(mode) {
    const input = nameInput(mode);
    if (!input) return null;

    let box = document.getElementById(suggestionId(mode));
    if (box) return box;

    box = document.createElement('div');
    box.id = suggestionId(mode);
    box.className = 'fire-s-premises-name-suggestions';
    box.style.cssText = [
      'margin-top:6px',
      'padding:8px 10px',
      'border:1px solid #d9dee7',
      'border-radius:8px',
      'background:#fff',
      'box-shadow:0 2px 8px rgba(0,0,0,.06)',
      'font-size:13px',
      'line-height:1.35',
      'display:none',
      'position:relative',
      'z-index:20'
    ].join(';');

    input.insertAdjacentElement('afterend', box);
    return box;
  }

  function renderSuggestions(mode) {
    const box = ensureSuggestionBox(mode);
    if (!box) return;

    const typed = clean(enteredName(mode));
    const matches = fuzzyMatches(mode);
    const duplicate = exactDuplicate(mode);

    duplicateLock[mode] = Boolean(duplicate);

    if (!typed || typed.length < 2 || matches.length === 0) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }

    const title = duplicate
      ? '<strong style="color:#b42318;">This name already exists</strong>'
      : '<strong>Existing premises with similar names</strong>';

    const items = matches.map(item => {
      const exact = item.key === normalize(typed);
      return `
        <div style="
          padding:6px 0;
          border-top:1px solid #eef1f5;
          ${exact ? 'font-weight:700;color:#b42318;' : ''}
        ">
          ${escapeHtml(item.name)}
          ${exact ? ' &nbsp;—&nbsp; exact match' : ''}
        </div>
      `;
    }).join('');

    box.innerHTML = `
      <div style="margin-bottom:4px;">${title}</div>
      ${items}
      <div style="margin-top:6px;color:#667085;font-size:12px;">
        Use the existing premises if it is the same location. If it is a different
        branch or site, add the branch, suburb or area to make the name unique.
      </div>
    `;

    box.style.display = 'block';
  }

  function escapeHtml(value) {
    return clean(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function focusName(mode) {
    const input = nameInput(mode);
    if (!input) return;

    try {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => input.focus({ preventScroll: true }), 160);
    } catch (_) {
      try { input.focus(); } catch (_) {}
    }
  }

  function showDuplicateWarning(mode) {
    const duplicate = exactDuplicate(mode);
    if (!duplicate) return;

    const attempted = enteredName(mode);

    alert(
      'Premises name already exists\n\n' +
      `"${attempted}" is already in Fire-S.\n\n` +
      'This inspection cannot be saved or closed until the premises name is unique. ' +
      'If it is the same location, use the existing premises. If it is another branch ' +
      'or site, add the branch, suburb or area to the name.'
    );

    focusName(mode);
    renderSuggestions(mode);
  }

  function stop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function modeForButton(button) {
    const id = button?.id || '';
    const text = clean(
      button?.innerText ||
      button?.value ||
      button?.getAttribute?.('aria-label') ||
      button?.title
    ).toLocaleLowerCase();

    const scheduleIds = new Set([
      'saveScheduledInspectionBtn',
      'scheduleSaveBtn',
      'saveScheduleBtn'
    ]);

    if (scheduleIds.has(id) || text.includes('save schedule')) return 'schedule';

    const protectedWords = [
      'save',
      'close',
      'finish',
      'finalise',
      'finalize'
    ];

    if (protectedWords.some(word => text === word || text.includes(word))) {
      return 'inspection';
    }

    return null;
  }

  function updateLock(mode) {
    duplicateLock[mode] = Boolean(exactDuplicate(mode));
    renderSuggestions(mode);
  }

  function validateAction(mode) {
    updateLock(mode);

    if (!duplicateLock[mode]) return true;

    showDuplicateWarning(mode);
    return false;
  }

  // Live comparison as the user types.
  document.addEventListener('input', event => {
    const id = event.target?.id;

    if (id === 'siteName' || id === 'organisationName') {
      updateLock('inspection');
    }

    if (id === 'scheduleSiteName' || id === 'scheduleOrganisationName') {
      updateLock('schedule');
    }
  }, true);

  // Hard-block the visible Save / Close / Finish / Schedule actions.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.(
      'button, input[type="button"], input[type="submit"], a'
    );
    if (!button) return;

    const mode = modeForButton(button);
    if (!mode) return;

    if (!validateAction(mode)) {
      stop(event);
    }
  }, true);

  // Also block form submissions.
  document.addEventListener('submit', event => {
    const form = event.target;
    const schedule =
      form?.querySelector?.('#scheduleSiteName, #scheduleOrganisationName');
    const mode = schedule ? 'schedule' : 'inspection';

    if (!validateAction(mode)) {
      stop(event);
    }
  }, true);

  function candidateIsNewOrRenamed(candidate, previousProjects) {
    const previous = previousProjects.find(
      p => String(p?.id || '') === String(candidate?.id || '')
    );

    if (!previous) return true;

    return normalize(premisesName(previous)) !== normalize(premisesName(candidate));
  }

  function duplicateInProposed(candidate, proposed) {
    const candidateKey = normalize(premisesName(candidate));
    if (!candidateKey) return null;

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

      return normalize(premisesName(other)) === candidateKey;
    }) || null;
  }

  function previousProjectsFromStorage() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function validateProposedWrite(proposedProjects) {
    const previous = previousProjectsFromStorage();
    const proposed = Array.isArray(proposedProjects) ? proposedProjects : [];

    for (const candidate of proposed) {
      if (!candidate || !candidateIsNewOrRenamed(candidate, previous)) continue;

      const dup = duplicateInProposed(candidate, proposed);
      if (!dup) continue;

      const name = premisesName(candidate);

      alert(
        'Premises name already exists\n\n' +
        `"${name}" is already in Fire-S.\n\n` +
        'The record was not saved. Change the premises name or use the existing premises.'
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
    if (original.__fireSPremisesIntegrityV14) return true;

    while (original && original.__fireSOriginal) {
      original = original.__fireSOriginal;
    }

    function protectedSetProjects(projects) {
      validateProposedWrite(projects);
      return original.call(this, projects);
    }

    protectedSetProjects.__fireSPremisesIntegrityV14 = true;
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
    updateInspection: () => updateLock('inspection'),
    updateSchedule: () => updateLock('schedule'),
    validateInspection: () => validateAction('inspection'),
    validateSchedule: () => validateAction('schedule'),
    normalize
  };

  console.info(`[Fire-S] Premises Integrity Guard ${VERSION} active.`);
})();
