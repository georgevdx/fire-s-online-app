
/* Fire-S Building Passport Stable v104.4 */

(function () {
  let lastSignature = '';
  let lastProjectId = '';

  function esc(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function currentPremises() {
    if (typeof currentProjectId === 'undefined' || !currentProjectId) return null;
    if (typeof getProjects !== 'function') return null;
    return getProjects().find(project => project.id === currentProjectId) || null;
  }

  function keyDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  function displayDate(value) {
    const key = keyDate(value);
    if (!key) return 'Not set';
    const date = new Date(key + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? key : date.toLocaleDateString();
  }

  function daysFromToday(value) {
    const key = keyDate(value);
    if (!key) return null;
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
    const target = new Date(key + 'T00:00:00');
    if (Number.isNaN(target.getTime())) return null;
    return Math.round((target - today) / 86400000);
  }

  function name(project) {
    return project?.projectName ||
      [project?.organisationName, project?.siteName].filter(Boolean).join(' - ') ||
      project?.siteName ||
      'Untitled Premises';
  }

  function address(project) {
    return project?.projectAddress ||
      [project?.streetNumber, project?.addressLine].filter(Boolean).join(' ') ||
      project?.addressLine ||
      'No address captured';
  }

  function actions(project) {
    return Array.isArray(project?.actions) ? project.actions : [];
  }

  function openActions(project) {
    return actions(project).filter(action => String(action.status || '').toLowerCase() !== 'closed');
  }

  function actionStats(project) {
    const open = openActions(project);
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: actions(project).length,
      open: open.length,
      critical: open.filter(a => a.priority === 'Critical').length,
      high: open.filter(a => a.priority === 'High').length,
      medium: open.filter(a => a.priority === 'Medium').length,
      low: open.filter(a => a.priority === 'Low').length,
      overdue: open.filter(a => a.dueDate && String(a.dueDate).slice(0, 10) < today).length,
      closed: actions(project).filter(a => String(a.status || '').toLowerCase() === 'closed').length
    };
  }

  function answers(project) {
    return Array.isArray(project?.answers) ? project.answers : [];
  }

  function answered(project) {
    return answers(project).filter(a => String(a.answer || '').trim()).length;
  }

  function noCount(project) {
    return answers(project).filter(a => String(a.answer || '').trim().toLowerCase() === 'no').length;
  }

  function score(project) {
    const total = answered(project);
    if (!total) return 0;
    return Math.max(0, Math.round(((total - noCount(project)) / total) * 100));
  }

  function scoreLabel(value) {
    if (value >= 90) return 'Excellent';
    if (value >= 75) return 'Good';
    if (value >= 55) return 'Attention';
    return 'Critical';
  }

  function lastInspection(project) {
    const dates = [
      project?.completedAt,
      project?.inspectionDate,
      project?.lastSaved,
      ...(project?.inspectionHistory || []).map(item => item?.completedAt || item?.inspectionDate || item?.archivedAt || '')
    ].map(keyDate).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : '';
  }

  function nextInspection(project) {
    if (!project) return '';
    if (project.scheduledDate) return project.scheduledDate;
    if (project.followUpDate) return project.followUpDate;
    if (project.recurringCycleEnabled === true && typeof getNextRecurringCycleDate === 'function') {
      return getNextRecurringCycleDate(project);
    }
    return '';
  }

  function photos(project) {
    const current = Array.isArray(project?.photos) ? project.photos.length : 0;
    const history = (project?.inspectionHistory || []).reduce((sum, item) => sum + ((item?.photos || []).length), 0);
    return current + history;
  }

  function history(project) {
    return Array.isArray(project?.inspectionHistory) ? project.inspectionHistory.length : 0;
  }

  function health(project) {
    const groups = new Map();

    answers(project).forEach((answer) => {
      const section = answer.sectionName || answer.category || 'Inspection';
      if (!groups.has(section)) groups.set(section, { total: 0, no: 0 });
      const group = groups.get(section);
      if (String(answer.answer || '').trim()) group.total += 1;
      if (String(answer.answer || '').trim().toLowerCase() === 'no') group.no += 1;
    });

    return Array.from(groups.entries()).map(([section, data]) => ({
      section,
      total: data.total,
      no: data.no,
      score: data.total ? Math.max(0, Math.round(((data.total - data.no) / data.total) * 100)) : 0
    })).sort((a, b) => a.score - b.score).slice(0, 8);
  }

  function summary(project) {
    const s = score(project);
    const a = actionStats(project);
    const next = nextInspection(project);
    const last = lastInspection(project);
    const nextDays = daysFromToday(next);
    const lines = [];

    lines.push(last ? `Last inspection was recorded on ${displayDate(last)}.` : 'No inspection date has been recorded yet.');
    lines.push(`Current compliance score is ${s}% (${scoreLabel(s)}).`);

    if (a.open) {
      lines.push(`${a.open} action${a.open === 1 ? '' : 's'} remain open, including ${a.critical} critical and ${a.high} high priority action${a.high === 1 ? '' : 's'}.`);
    } else {
      lines.push('No open actions are currently recorded for this premises.');
    }

    if (a.overdue) {
      lines.push(`${a.overdue} open action${a.overdue === 1 ? ' is' : 's are'} overdue.`);
    }

    if (next) {
      const timing = nextDays === null ? '' : nextDays < 0 ? ` (${Math.abs(nextDays)} day${Math.abs(nextDays) === 1 ? '' : 's'} overdue)` : ` (in ${nextDays} day${nextDays === 1 ? '' : 's'})`;
      lines.push(`Next inspection or follow-up is scheduled for ${displayDate(next)}${timing}.`);
    }

    return lines;
  }

  function dataSignature(project) {
    const a = actionStats(project);
    return JSON.stringify({
      id: project?.id,
      name: name(project),
      address: address(project),
      last: lastInspection(project),
      next: nextInspection(project),
      score: score(project),
      answered: answered(project),
      no: noCount(project),
      photos: photos(project),
      history: history(project),
      actions: a,
      actionUpdated: project?.actionEngineUpdatedAt || '',
      saved: project?.lastSaved || ''
    });
  }

  function render(project) {
    const s = score(project);
    const a = actionStats(project);
    const h = health(project);

    return `
      <section class="fire-s-building-passport-v104 fire-s-building-passport-stable-v1044">
        <div class="fire-s-passport-hero-v104">
          <div>
            <span>Building Passport</span>
            <h2>${esc(name(project))}</h2>
            <p>${esc(address(project))}</p>
          </div>
          <div class="fire-s-passport-score-v104">
            <small>${esc(scoreLabel(s))}</small>
            <strong>${s}%</strong>
          </div>
        </div>

        <div class="fire-s-passport-tabs-v104">
          <button type="button" class="active" data-passport-tab="overview">Overview</button>
          <button type="button" data-scroll-target="fireSActionRegisterPanelV1033">Actions</button>
          <button type="button" data-scroll-target="checklist">Inspection</button>
          <button type="button" data-scroll-target="photoPreview">Photos</button>
          <button type="button" data-scroll-target="reportSection">Reports</button>
        </div>

        <div class="fire-s-passport-grid-v104">
          <div><span>Last Inspection</span><strong>${esc(displayDate(lastInspection(project)))}</strong></div>
          <div><span>Next Inspection</span><strong>${esc(displayDate(nextInspection(project)))}</strong></div>
          <div><span>Open Actions</span><strong>${a.open}</strong></div>
          <div><span>Critical / High</span><strong>${a.critical} / ${a.high}</strong></div>
          <div><span>Overdue Actions</span><strong>${a.overdue}</strong></div>
          <div><span>Findings</span><strong>${noCount(project)}</strong></div>
          <div><span>Photos</span><strong>${photos(project)}</strong></div>
          <div><span>History</span><strong>${history(project)}</strong></div>
        </div>

        <div class="fire-s-passport-insight-v1041">
          <h3>Premises Summary</h3>
          <ul>${summary(project).map(line => `<li>${esc(line)}</li>`).join('')}</ul>
        </div>

        <div class="fire-s-passport-health-v104">
          <h3>Building Health</h3>
          ${h.length ? h.map(item => `
            <div class="fire-s-health-row-v104">
              <div>
                <strong>${esc(item.section)}</strong>
                <span>${item.no} finding${item.no === 1 ? '' : 's'} / ${item.total} answered</span>
              </div>
              <div class="fire-s-health-bar-v104"><i style="width:${item.score}%"></i></div>
              <b>${item.score}%</b>
            </div>
          `).join('') : '<p class="fire-s-passport-muted-v104">Health will populate as checklist answers are captured.</p>'}
        </div>
      </section>
    `;
  }

  function bindTabs(wrapper) {
    if (!wrapper) return;

    wrapper.querySelectorAll('[data-scroll-target]').forEach(button => {
      if (button.dataset.fireSStableBound === 'true') return;
      button.dataset.fireSStableBound = 'true';

      button.addEventListener('click', () => {
        wrapper.querySelectorAll('.fire-s-passport-tabs-v104 button')
          .forEach(tab => tab.classList.remove('active'));

        button.classList.add('active');

        const target = document.getElementById(button.dataset.scrollTarget);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    wrapper.querySelectorAll('[data-passport-tab="overview"]').forEach(button => {
      if (button.dataset.fireSStableBound === 'true') return;
      button.dataset.fireSStableBound = 'true';

      button.addEventListener('click', () => {
        wrapper.querySelectorAll('.fire-s-passport-tabs-v104 button')
          .forEach(tab => tab.classList.remove('active'));

        button.classList.add('active');
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function inject(force = false) {
    const form = document.getElementById('projectFormSection');
    if (!form || form.style.display === 'none') return;

    const project = currentPremises();
    if (!project) return;

    let wrapper = document.getElementById('fireSBuildingPassportV104Wrapper');

    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'fireSBuildingPassportV104Wrapper';

      const oldWorkspace = document.getElementById('fireSPremisesWorkspaceLiteV101');
      const toolbar = form.querySelector('.toolbar');

      if (oldWorkspace) oldWorkspace.insertAdjacentElement('afterend', wrapper);
      else if (toolbar) toolbar.insertAdjacentElement('afterend', wrapper);
      else form.insertAdjacentElement('afterbegin', wrapper);
    }

    const signature = dataSignature(project);
    const projectChanged = lastProjectId !== project.id;

    if (force || projectChanged || wrapper.dataset.signature !== signature) {
      const previousScrollY = window.scrollY;
      wrapper.innerHTML = render(project);
      wrapper.dataset.signature = signature;
      lastSignature = signature;
      lastProjectId = project.id;

      // Stop visual jump caused by periodic re-rendering.
      if (!force && !projectChanged) {
        requestAnimationFrame(() => window.scrollTo({ top: previousScrollY, behavior: 'auto' }));
      }
    }

    bindTabs(wrapper);
  }

  window.FireSBuildingPassport = { inject, render };

  setTimeout(() => inject(true), 700);

  // No constant interval re-render. Only lightweight checks when likely needed.
  document.addEventListener('change', event => {
    if (event.target && (
      event.target.classList?.contains('answer-select') ||
      event.target.closest?.('#projectFormSection')
    )) {
      setTimeout(() => inject(false), 250);
    }
  });

  document.addEventListener('click', event => {
    if (event.target && (
      event.target.closest?.('.fire-s-action-modal-v1034') ||
      event.target.closest?.('.fire-s-action-register-v1033')
    )) {
      setTimeout(() => inject(false), 350);
    }
  });

  window.addEventListener('fireSProjectOpened', () => setTimeout(() => inject(true), 250));
})();
