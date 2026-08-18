
/* Fire-S v105.0 Premises Workspace Redesign
   One premises page. One header. Tabbed workspace.
*/

(function () {
  let lastProjectId = '';
  let lastSignature = '';

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

  function dateKey(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  function dateText(value) {
    const key = dateKey(value);
    if (!key) return 'Not set';
    const d = new Date(key + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString();
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

  function scoreLabel(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 55) return 'Attention';
    return 'Critical';
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
      open: open.length,
      critical: open.filter(a => a.priority === 'Critical').length,
      high: open.filter(a => a.priority === 'High').length,
      overdue: open.filter(a => a.dueDate && String(a.dueDate).slice(0, 10) < today).length,
      closed: actions(project).filter(a => String(a.status || '').toLowerCase() === 'closed').length
    };
  }

  function lastInspection(project) {
    const dates = [
      project?.completedAt,
      project?.inspectionDate,
      project?.lastSaved,
      ...(project?.inspectionHistory || []).map(item =>
        item?.completedAt || item?.inspectionDate || item?.archivedAt || ''
      )
    ].map(dateKey).filter(Boolean).sort();

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

  function photoCount(project) {
    const current = Array.isArray(project?.photos) ? project.photos.length : 0;
    const history = (project?.inspectionHistory || []).reduce(
      (sum, item) => sum + ((item?.photos || []).length),
      0
    );

    return current + history;
  }

  function historyCount(project) {
    return Array.isArray(project?.inspectionHistory) ? project.inspectionHistory.length : 0;
  }

  function healthRows(project) {
    const groups = new Map();

    answers(project).forEach(answer => {
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
    const lines = [];

    lines.push(`Compliance score is ${s}% (${scoreLabel(s)}).`);

    if (a.open) {
      lines.push(`${a.open} open action${a.open === 1 ? '' : 's'} currently require follow-up.`);
    } else {
      lines.push('No open actions are currently recorded.');
    }

    if (a.overdue) {
      lines.push(`${a.overdue} action${a.overdue === 1 ? ' is' : 's are'} overdue.`);
    }

    const next = nextInspection(project);
    if (next) {
      lines.push(`Next inspection or follow-up: ${dateText(next)}.`);
    }

    return lines;
  }

  function signature(project) {
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
      photos: photoCount(project),
      history: historyCount(project),
      actions: a,
      updated: project?.lastSaved || project?.actionEngineUpdatedAt || ''
    });
  }

  function render(project) {
    const s = score(project);
    const a = actionStats(project);
    const h = healthRows(project);

    return `
      <section class="fire-s-workspace-v105">
        <div class="fire-s-workspace-hero-v105">
          <div>
            <div class="fire-s-workspace-kicker-v105">Premises Workspace</div>
            <h2>${esc(name(project))}</h2>
            <p>${esc(address(project))}</p>
          </div>

          <div class="fire-s-workspace-score-v105">
            <span>${esc(scoreLabel(s))}</span>
            <strong>${s}%</strong>
          </div>
        </div>

        <nav class="fire-s-workspace-tabs-v105">
          <button type="button" class="active" data-workspace-tab="overview">Overview</button>
          <button type="button" data-workspace-tab="actions">Actions</button>
          <button type="button" data-workspace-tab="equipment">Equipment</button>
          <button type="button" data-workspace-tab="photos">Photos</button>
          <button type="button" data-workspace-tab="reports">Reports</button>
          <button type="button" data-workspace-tab="history">History</button>
        </nav>

        <div class="fire-s-workspace-panel-v105 active" data-workspace-panel="overview">
          <div class="fire-s-workspace-grid-v105">
            <div><span>Last Inspection</span><strong>${esc(dateText(lastInspection(project)))}</strong></div>
            <div><span>Next Inspection</span><strong>${esc(dateText(nextInspection(project)))}</strong></div>
            <div><span>Open Actions</span><strong>${a.open}</strong></div>
            <div><span>Critical / High</span><strong>${a.critical} / ${a.high}</strong></div>
            <div><span>Overdue</span><strong>${a.overdue}</strong></div>
            <div><span>Findings</span><strong>${noCount(project)}</strong></div>
            <div><span>Photos</span><strong>${photoCount(project)}</strong></div>
            <div><span>History</span><strong>${historyCount(project)}</strong></div>
          </div>

          <div class="fire-s-workspace-summary-v105">
            <h3>Summary</h3>
            <ul>${summary(project).map(line => `<li>${esc(line)}</li>`).join('')}</ul>
          </div>

          <div class="fire-s-workspace-health-v105">
            <h3>Building Health</h3>
            ${
              h.length
                ? h.map(item => `
                  <div class="fire-s-health-row-v105">
                    <div>
                      <strong>${esc(item.section)}</strong>
                      <span>${item.no} finding${item.no === 1 ? '' : 's'} / ${item.total} answered</span>
                    </div>
                    <div class="fire-s-health-bar-v105"><i style="width:${item.score}%"></i></div>
                    <b>${item.score}%</b>
                  </div>
                `).join('')
                : '<p class="fire-s-empty-v105">Building health will populate as checklist answers are captured.</p>'
            }
          </div>
        </div>

        <div class="fire-s-workspace-panel-v105" data-workspace-panel="actions">
          <div id="fireSWorkspaceActionsSlotV105" class="fire-s-workspace-slot-v105"></div>
        </div>

        <div class="fire-s-workspace-panel-v105" data-workspace-panel="equipment">
          <div id="fireSWorkspaceEquipmentSlotV105" class="fire-s-workspace-slot-v105">
            <div class="fire-s-empty-v105">Equipment register will be built here.</div>
          </div>
        </div>

        <div class="fire-s-workspace-panel-v105" data-workspace-panel="photos">
          <div class="fire-s-workspace-shortcut-v105" data-scroll-target="photoPreview">
            Open photo gallery
          </div>
        </div>

        <div class="fire-s-workspace-panel-v105" data-workspace-panel="reports">
          <div class="fire-s-workspace-shortcut-v105" data-scroll-target="reportSection">
            Open reports section
          </div>
        </div>

        <div class="fire-s-workspace-panel-v105" data-workspace-panel="history">
          <div class="fire-s-workspace-grid-v105">
            <div><span>Archived inspections</span><strong>${historyCount(project)}</strong></div>
            <div><span>Closed actions</span><strong>${a.closed}</strong></div>
            <div><span>Last saved</span><strong>${esc(dateText(project.lastSaved))}</strong></div>
            <div><span>Inspection No.</span><strong>${esc(project.inspectionNumber || '-')}</strong></div>
          </div>
        </div>
      </section>
    `;
  }

  function hideLegacyBlocks() {
    document.getElementById('fireSPremisesWorkspaceLiteV101')?.classList.add('fire-s-hidden-v105');
    document.getElementById('fireSBuildingPassportV104Wrapper')?.classList.add('fire-s-hidden-v105');

    const passportBlocks = document.querySelectorAll('.fire-s-building-passport-v104');
    passportBlocks.forEach(block => block.classList.add('fire-s-hidden-v105'));
  }

  function placeActionRegister() {
    const slot = document.getElementById('fireSWorkspaceActionsSlotV105');
    const register = document.querySelector('.fire-s-action-register-v1033');

    if (!slot || !register) return;

    if (register.parentElement !== slot) {
      slot.appendChild(register);
    }

    register.classList.add('fire-s-action-register-v105-integrated');
  }

  function bindTabs(wrapper) {
    wrapper.querySelectorAll('[data-workspace-tab]').forEach(button => {
      if (button.dataset.boundV105 === 'true') return;
      button.dataset.boundV105 = 'true';

      button.addEventListener('click', () => {
        const tab = button.dataset.workspaceTab;

        wrapper.querySelectorAll('[data-workspace-tab]')
          .forEach(item => item.classList.toggle('active', item === button));

        wrapper.querySelectorAll('[data-workspace-panel]')
          .forEach(panel => panel.classList.toggle('active', panel.dataset.workspacePanel === tab));

        if (tab === 'actions') {
          placeActionRegister();
          if (window.FireSActionRegister?.render) {
            window.FireSActionRegister.render();
          }
        }
      });
    });

    wrapper.querySelectorAll('[data-scroll-target]').forEach(item => {
      if (item.dataset.shortcutBoundV105 === 'true') return;
      item.dataset.shortcutBoundV105 = 'true';

      item.addEventListener('click', () => {
        const target = document.getElementById(item.dataset.scrollTarget);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function isInspectorRole() {
    try {
      const role = typeof window.getCurrentUserRole === 'function'
        ? window.getCurrentUserRole()
        : (window.currentUserProfile?.role || document.body?.dataset?.fireSResolvedRole || '');
      return String(role || '').trim().toLowerCase() === 'inspector';
    } catch (_) {
      return false;
    }
  }

  function removeInspectorWorkspace() {
    const wrapper = document.getElementById('fireSPremisesWorkspaceV105');
    if (wrapper) wrapper.remove();
  }

  function isFillingInspection() {
    if (typeof window.fireSIsFillingInspection === 'function') {
      return window.fireSIsFillingInspection();
    }
    const form = document.getElementById('projectFormSection');
    return !!(form && form.style.display !== 'none' && !form.hidden);
  }

  function inject(force = false) {
    if (isFillingInspection()) {
      removeInspectorWorkspace();
      return;
    }

    if (isInspectorRole()) {
      removeInspectorWorkspace();
      return;
    }

    const form = document.getElementById('projectFormSection');
    if (!form || form.style.display === 'none') return;

    const project = currentPremises();
    if (!project) return;

    hideLegacyBlocks();

    let wrapper = document.getElementById('fireSPremisesWorkspaceV105');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'fireSPremisesWorkspaceV105';

      const toolbar = form.querySelector('.toolbar') || form.firstElementChild;
      if (toolbar) toolbar.insertAdjacentElement('afterend', wrapper);
      else form.insertAdjacentElement('afterbegin', wrapper);
    }

    const sig = signature(project);
    const projectChanged = lastProjectId !== project.id;

    if (force || projectChanged || wrapper.dataset.signature !== sig) {
      const activeTab =
        wrapper.querySelector('[data-workspace-tab].active')?.dataset.workspaceTab || 'overview';

      wrapper.innerHTML = render(project);
      wrapper.dataset.signature = sig;
      lastSignature = sig;
      lastProjectId = project.id;

      const restoreTab = wrapper.querySelector(`[data-workspace-tab="${activeTab}"]`);
      if (restoreTab && activeTab !== 'overview') {
        restoreTab.click();
      }
    }

    bindTabs(wrapper);
    placeActionRegister();
  }

  window.FireSPremisesWorkspace = { inject, render };

  setTimeout(() => inject(true), 900);

  document.addEventListener('change', event => {
    if (event.target?.closest?.('#projectFormSection')) {
      setTimeout(() => inject(false), 300);
    }
  });

  document.addEventListener('click', event => {
    if (event.target?.closest?.('.fire-s-action-register-v1033') || event.target?.closest?.('.fire-s-action-modal-v1034')) {
      setTimeout(() => inject(false), 450);
    }
  });
})();
