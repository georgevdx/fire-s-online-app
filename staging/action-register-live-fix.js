
/* Fire-S v105.2 Action Register Live Fix
   Fixes counters showing 0 by rendering directly from the visible checklist when project.actions has not populated yet.
*/

(function () {
  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function currentProjectSafe() {
    if (typeof currentProjectId === 'undefined' || !currentProjectId) return null;
    if (typeof getProjects !== 'function') return null;
    return getProjects().find(p => p.id === currentProjectId) || null;
  }

  function norm(v) {
    return String(v || '').trim().toLowerCase();
  }

  function datePlus(days) {
    const d = new Date();
    d.setDate(d.getDate() + Number(days || 30));
    return d.toISOString().slice(0, 10);
  }

  function getChecklist() {
    if (typeof getActiveTemplateChecklist === 'function') {
      const list = getActiveTemplateChecklist();
      if (Array.isArray(list) && list.length) return list;
    }
    if (typeof checklists !== 'undefined' && Array.isArray(checklists)) return checklists;
    return [];
  }

  function getQuestionFromRow(row, item, index) {
    return (
      item?.["Checklist Item"] ||
      row?.querySelector('label,strong,.question-text,.checklist-question')?.textContent?.trim() ||
      `Checklist item ${index + 1}`
    );
  }

  function getSectionFromRow(row, item) {
    if (item?.sectionName || item?._sectionName) return item.sectionName || item._sectionName;
    const sectionIndex = row?.dataset?.sectionIndex;
    const header =
      document.getElementById(`sectionHeader_${sectionIndex}`) ||
      document.getElementById(`sectionHeading_${sectionIndex}`) ||
      document.querySelector(`.section-header[data-section-index="${sectionIndex}"]`);
    return header?.textContent?.replace(/[>v]/g, '').trim() || 'Inspection';
  }

  function ruleFor(section, question, item) {
    if (window.FireSActionEngine?.findRule) return window.FireSActionEngine.findRule(section, question, item || {});
    const t = `${section} ${question}`.toLowerCase();
    if (t.includes('extinguisher') || t.includes('fire equipment')) return { priority: 'Critical', responsible: 'Approved Contractor', dueDays: 14 };
    if (t.includes('escape') || t.includes('exit')) return { priority: 'Critical', responsible: 'Building Owner', dueDays: 7 };
    if (t.includes('lighting') || t.includes('alarm') || t.includes('detection')) return { priority: 'High', responsible: 'Approved Contractor', dueDays: 21 };
    return { priority: item?.Severity || 'High', responsible: 'Building Owner', dueDays: 30 };
  }

  function virtualActionsFromVisibleChecklist(project) {
    const checklist = getChecklist();
    const actions = [];
    const rows = Array.from(document.querySelectorAll('.checklist-row'));

    document.querySelectorAll('.answer-select').forEach((field, idx) => {
      if (norm(field.value) !== 'no') return;

      const row = field.closest('.checklist-row') || rows[idx];
      const itemIndex = Number(field.dataset.index ?? row?.dataset.itemIndex ?? idx);
      const item = checklist[itemIndex] || checklist[idx] || {};
      const question = getQuestionFromRow(row, item, itemIndex);
      const section = getSectionFromRow(row, item);
      const rule = ruleFor(section, question, item);
      const note = document.getElementById(`note_${itemIndex}`)?.value?.trim() || '';

      actions.push({
        actionId: `LIVE-${String(itemIndex + 1).padStart(3, '0')}`,
        actionKey: `${project?.id || 'current'}|${itemIndex}|${question}`,
        premisesId: project?.id || '',
        inspectionId: project?.id || '',
        itemIndex,
        itemNumber: item["Item Number"] || String(itemIndex + 1),
        sectionName: section,
        question,
        finding: item["Non Compliance Text"] || note || question,
        correctiveAction: item["Corrective Action"] || '',
        reference: item.Reference || '',
        priority: item.Severity || rule.priority || 'High',
        responsible: rule.responsible || 'Building Owner',
        dueDate: datePlus(rule.dueDays),
        status: 'Open',
        createdDate: new Date().toISOString(),
        liveOnly: true
      });
    });

    return actions;
  }

  function realActions(project) {
    return Array.isArray(project?.actions) ? project.actions : [];
  }

  function actionsForRegister(project) {
    const real = realActions(project);
    const openReal = real.filter(a => norm(a.status) !== 'closed');
    const live = virtualActionsFromVisibleChecklist(project);

    const byKey = new Map();
    real.forEach(a => byKey.set(a.actionKey || a.actionId, a));
    live.forEach(a => {
      const key = a.actionKey || a.actionId;
      if (!byKey.has(key)) byKey.set(key, a);
    });

    const merged = Array.from(byKey.values());

    return merged.length ? merged : real;
  }

  function isOpen(a) {
    return norm(a.status) !== 'closed';
  }

  function priority(a) {
    return String(a.priority || 'Medium').trim() || 'Medium';
  }

  function priorityClass(p) {
    p = String(p || '').toLowerCase();
    if (p === 'critical') return 'critical';
    if (p === 'high') return 'high';
    if (p === 'low') return 'low';
    return 'medium';
  }

  function stats(actions) {
    const open = actions.filter(isOpen);
    return {
      open: open.length,
      critical: open.filter(a => priority(a) === 'Critical').length,
      high: open.filter(a => priority(a) === 'High').length,
      medium: open.filter(a => priority(a) === 'Medium').length,
      low: open.filter(a => priority(a) === 'Low').length,
      closed: actions.filter(a => !isOpen(a)).length
    };
  }

  function filtered(actions, filter) {
    if (!filter || filter === 'open') return actions.filter(isOpen);
    if (filter === 'closed') return actions.filter(a => !isOpen(a));
    return actions.filter(a => isOpen(a) && priority(a).toLowerCase() === filter);
  }

  function displayDate(v) {
    if (!v) return 'Not set';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toLocaleDateString();
  }

  function card(a) {
    const p = priority(a);
    return `<div class="fire-s-action-card-v1033 priority-${priorityClass(p)}">
      <div class="fire-s-action-top-v1033">
        <div><strong>${esc(a.liveOnly ? 'Unsaved Action' : (a.actionId || 'Action'))}</strong><span>${esc(a.status || 'Open')}</span></div>
        <b>${esc(p)}</b>
      </div>
      <div class="fire-s-action-question-v1033">${esc(a.question || a.finding || 'Action item')}</div>
      ${a.finding && a.finding !== a.question ? `<div class="fire-s-action-finding-v1033">${esc(a.finding)}</div>` : ''}
      <div class="fire-s-action-meta-v1033">
        <div><span>Responsible</span><strong>${esc(a.responsible || 'Not assigned')}</strong></div>
        <div><span>Due</span><strong>${esc(displayDate(a.dueDate))}</strong></div>
        <div><span>Section</span><strong>${esc(a.sectionName || 'Checklist')}</strong></div>
        <div><span>Source</span><strong>${a.liveOnly ? 'Current NO answer' : 'Saved Action'}</strong></div>
      </div>
      ${a.liveOnly ? '<div class="fire-s-live-action-note-v1052">Click Save to store this as a permanent Action.</div>' : ''}
      ${!a.liveOnly ? `<div class="fire-s-action-buttons-v1034"><button type="button" data-edit-action="${esc(a.actionId)}">Update / Resolve</button></div>` : ''}
    </div>`;
  }

  function renderRegister(filter = 'open') {
    const panel = document.getElementById('fireSActionRegisterPanelV1033');
    if (!panel) return false;

    const project = currentProjectSafe();
    if (!project) return false;

    const actions = actionsForRegister(project);
    const s = stats(actions);
    const list = filtered(actions, filter);

    panel.dataset.filter = filter;

    panel.innerHTML = `
      <div class="fire-s-action-summary-v1033">
        ${[
          ['open', 'Open', s.open],
          ['critical', 'Critical', s.critical],
          ['high', 'High', s.high],
          ['medium', 'Medium', s.medium],
          ['low', 'Low', s.low],
          ['closed', 'Closed', s.closed]
        ].map(x => `<button type="button" data-action-filter="${x[0]}" class="${filter === x[0] ? 'active' : ''}"><span>${x[2]}</span><small>${x[1]}</small></button>`).join('')}
      </div>
      <div class="fire-s-action-list-v1033">
        ${list.length ? list.map(card).join('') : '<div class="fire-s-action-empty-v1033">No actions in this filter.</div>'}
      </div>
    `;

    panel.querySelectorAll('[data-action-filter]').forEach(button => {
      button.addEventListener('click', () => renderRegister(button.dataset.actionFilter));
    });

    panel.querySelectorAll('[data-edit-action]').forEach(button => {
      button.addEventListener('click', () => {
        if (window.FireSActionRegister?.openEditor) {
          window.FireSActionRegister.openEditor(button.dataset.editAction);
        }
      });
    });

    return true;
  }

  function patchActionRegister() {
    if (!window.FireSActionRegister || window.FireSActionRegister.liveFixPatched) return;

    window.FireSActionRegister.originalRender1052 = window.FireSActionRegister.render;
    window.FireSActionRegister.render = function fixedRender(filter) {
      if (renderRegister(filter || document.getElementById('fireSActionRegisterPanelV1033')?.dataset.filter || 'open')) {
        return;
      }
      return window.FireSActionRegister.originalRender1052?.apply(this, arguments);
    };
    window.FireSActionRegister.liveFixPatched = true;
  }

  function forceSyncAndRender() {
    patchActionRegister();

    if (window.FireSActionSyncFix?.syncCurrentProject) {
      window.FireSActionSyncFix.syncCurrentProject({ renderList: false });
    }

    renderRegister(document.getElementById('fireSActionRegisterPanelV1033')?.dataset.filter || 'open');

    if (window.FireSPremisesWorkspace?.inject) {
      window.FireSPremisesWorkspace.inject(false);
    }
  }

  document.addEventListener('change', event => {
    if (event.target?.classList?.contains('answer-select')) {
      setTimeout(forceSyncAndRender, 100);
      setTimeout(forceSyncAndRender, 500);
    }
  });

  document.addEventListener('click', event => {
    if (event.target?.id === 'fireSRefreshActionRegisterV1033') {
      setTimeout(forceSyncAndRender, 50);
    }
  });

  window.FireSActionRegisterLiveFix = {
    run: forceSyncAndRender,
    renderRegister,
    virtualActionsFromVisibleChecklist
  };

  setTimeout(forceSyncAndRender, 800);
  setTimeout(forceSyncAndRender, 1800);
  setTimeout(forceSyncAndRender, 3200);
})();
