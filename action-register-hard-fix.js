
/* Fire-S v105.3 Action Register Hard Fix
   Single source for Action Register:
   1. Read current visible checklist NO answers.
   2. Create/merge saved project.actions.
   3. Render counts from that merged data.
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

  function norm(v) {
    return String(v || '').trim().toLowerCase();
  }

  function projects() {
    return typeof getProjects === 'function' ? getProjects() : [];
  }

  function setAllProjects(list) {
    if (typeof setProjects === 'function') setProjects(list);
  }

  function currentProject() {
    if (typeof currentProjectId === 'undefined' || !currentProjectId) return null;
    return projects().find(p => p.id === currentProjectId) || null;
  }

  function currentProjectIndex(list) {
    if (typeof currentProjectId === 'undefined' || !currentProjectId) return -1;
    return list.findIndex(p => p.id === currentProjectId);
  }

  function getChecklist() {
    if (typeof getActiveTemplateChecklist === 'function') {
      const c = getActiveTemplateChecklist();
      if (Array.isArray(c) && c.length) return c;
    }

    if (typeof checklists !== 'undefined' && Array.isArray(checklists)) return checklists;

    return [];
  }

  function nextActionId(existing) {
    if (window.FireSActionEngine?.nextActionId) {
      return window.FireSActionEngine.nextActionId(existing || []);
    }

    const year = new Date().getFullYear();
    const key = `fires_action_counter_${year}`;
    const n = Number(localStorage.getItem(key) || '0') + 1;
    localStorage.setItem(key, String(n));
    return `AC-${year}-${String(n).padStart(6, '0')}`;
  }

  function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + Number(days || 30));
    return d.toISOString().slice(0, 10);
  }

  function rule(section, question, item) {
    if (window.FireSActionEngine?.findRule) return window.FireSActionEngine.findRule(section, question, item || {});

    const t = `${section} ${question}`.toLowerCase();

    if (t.includes('extinguisher') || t.includes('fire equipment')) {
      return { priority: 'Critical', responsible: 'Approved Contractor', dueDays: 14 };
    }

    if (t.includes('escape') || t.includes('exit')) {
      return { priority: 'Critical', responsible: 'Building Owner', dueDays: 7 };
    }

    if (t.includes('lighting') || t.includes('alarm') || t.includes('detection')) {
      return { priority: 'High', responsible: 'Approved Contractor', dueDays: 21 };
    }

    return { priority: item?.Severity || 'High', responsible: 'Building Owner', dueDays: 30 };
  }

  function rowQuestion(row, item, index) {
    return (
      item?.["Checklist Item"] ||
      row?.querySelector('.checklist-question,.question-text,label,strong')?.textContent?.trim() ||
      `Checklist item ${index + 1}`
    );
  }

  function rowSection(row, item, answer) {
    if (item?.sectionName || item?._sectionName) return item.sectionName || item._sectionName;
    if (answer?.sectionName || answer?.category) return answer.sectionName || answer.category;

    const sectionIndex = row?.dataset?.sectionIndex;
    const header =
      document.getElementById(`sectionHeader_${sectionIndex}`) ||
      document.getElementById(`sectionHeading_${sectionIndex}`) ||
      document.querySelector(`.section-header[data-section-index="${sectionIndex}"]`) ||
      document.querySelector(`[data-section-index="${sectionIndex}"].checklist-section-tab`);

    return header?.textContent?.replace(/[>v]/g, '').trim() || 'Inspection';
  }

  function actionKey(project, itemIndex, itemNumber, question) {
    return [
      project?.id || 'current',
      itemIndex,
      itemNumber || String(itemIndex + 1),
      norm(question)
    ].join('|');
  }

  function answersFromDom(project) {
    const checklist = getChecklist();
    const rows = Array.from(document.querySelectorAll('.checklist-row'));
    const list = [];

    document.querySelectorAll('.answer-select').forEach((field, domIndex) => {
      if (norm(field.value) !== 'no') return;

      const row = field.closest('.checklist-row') || rows[domIndex] || null;
      const itemIndex = Number(field.dataset.index ?? row?.dataset.itemIndex ?? domIndex);
      const item = checklist[itemIndex] || checklist[domIndex] || {};
      const question = rowQuestion(row, item, itemIndex);
      const section = rowSection(row, item, null);
      const itemNumber = item["Item Number"] || String(itemIndex + 1);
      const r = rule(section, question, item);
      const note = document.getElementById(`note_${itemIndex}`)?.value?.trim() || '';

      list.push({
        actionKey: actionKey(project, itemIndex, itemNumber, question),
        itemIndex,
        itemNumber,
        sectionName: section,
        question,
        finding: item["Non Compliance Text"] || note || question,
        correctiveAction: item["Corrective Action"] || '',
        reference: item.Reference || '',
        priority: item.Severity || r.priority || 'High',
        responsible: r.responsible || 'Building Owner',
        dueDate: addDays(r.dueDays)
      });
    });

    return list;
  }

  function answersFromProject(project) {
    const checklist = getChecklist();
    const list = [];

    (project?.answers || []).forEach((answer, index) => {
      if (norm(answer?.answer) !== 'no') return;

      const itemIndex = Number.isFinite(Number(answer.itemIndex)) ? Number(answer.itemIndex) : index;
      const item = checklist[itemIndex] || checklist[index] || {};
      const question = item["Checklist Item"] || answer.question || answer.item || `Checklist item ${itemIndex + 1}`;
      const section = item.sectionName || item._sectionName || answer.sectionName || answer.category || 'Inspection';
      const itemNumber = answer.itemNumber || item["Item Number"] || String(itemIndex + 1);
      const r = rule(section, question, item);

      list.push({
        actionKey: actionKey(project, itemIndex, itemNumber, question),
        itemIndex,
        itemNumber,
        sectionName: section,
        question,
        finding: item["Non Compliance Text"] || answer.note || question,
        correctiveAction: item["Corrective Action"] || '',
        reference: item.Reference || '',
        priority: item.Severity || r.priority || 'High',
        responsible: r.responsible || 'Building Owner',
        dueDate: addDays(r.dueDays)
      });
    });

    return list;
  }

  function noItems(project) {
    const dom = answersFromDom(project);
    const fromProject = answersFromProject(project);
    const map = new Map();

    fromProject.forEach(item => map.set(item.actionKey, item));
    dom.forEach(item => map.set(item.actionKey, item));

    return Array.from(map.values());
  }

  function permanentAction(project, item, existingActions) {
    const existing =
      (existingActions || []).find(a => a.actionKey === item.actionKey);

    if (existing) {
      if (norm(existing.status) === 'closed') {
        return {
          ...existing,
          status: 'Open',
          closedDate: '',
          closedBy: '',
          closeComment: '',
          history: [
            ...(existing.history || []),
            { event: 'Reopened', date: new Date().toISOString(), note: 'Checklist answer is NO.' }
          ]
        };
      }

      return {
        ...existing,
        ...item,
        status: existing.status || 'Open'
      };
    }

    const created = new Date().toISOString();

    return {
      actionId: nextActionId(existingActions),
      premisesId: project?.id || '',
      inspectionId: project?.id || '',
      inspectionNumber: project?.inspectionNumber || '',
      ...item,
      status: 'Open',
      createdDate: created,
      createdBy: project?.inspectorName || '',
      closedDate: '',
      closedBy: '',
      closeComment: '',
      photosBefore: [],
      photosAfter: [],
      comments: [],
      history: [
        { event: 'Created', date: created, note: 'Created automatically from NO checklist answer.' }
      ]
    };
  }

  function syncActionsToProject() {
    const list = projects();
    const index = currentProjectIndex(list);
    if (index === -1) return currentProject();

    const project = list[index];
    const existing = Array.isArray(project.actions) ? [...project.actions] : [];
    const noList = noItems(project);
    const noKeys = new Set(noList.map(item => item.actionKey));
    let changed = false;

    const map = new Map();

    existing.forEach(action => {
      map.set(action.actionKey || action.actionId, action);
    });

    noList.forEach(item => {
      const before = map.get(item.actionKey);
      const after = permanentAction(project, item, existing);
      map.set(item.actionKey, after);
      if (JSON.stringify(before || null) !== JSON.stringify(after)) changed = true;
    });

    Array.from(map.entries()).forEach(([key, action]) => {
      if (
        action.actionKey &&
        action.inspectionId === project.id &&
        norm(action.status) !== 'closed' &&
        !noKeys.has(action.actionKey)
      ) {
        map.set(key, {
          ...action,
          status: 'Closed',
          closedDate: new Date().toISOString(),
          closeComment: action.closeComment || 'Checklist answer is no longer NO.',
          history: [
            ...(action.history || []),
            { event: 'Closed', date: new Date().toISOString(), note: 'Checklist answer is no longer NO.' }
          ]
        });
        changed = true;
      }
    });

    const actions = Array.from(map.values());

    if (!changed && JSON.stringify(project.actions || []) === JSON.stringify(actions)) {
      return project;
    }

    list[index] = {
      ...project,
      actions,
      actionEngineUpdatedAt: new Date().toISOString(),
      syncPending: true,
      lastSaved: new Date().toISOString()
    };

    setAllProjects(list);

    if (typeof currentProject !== 'undefined' && currentProject?.id === project.id) {
      currentProject = list[index];
    }

    return list[index];
  }

  function isOpen(a) {
    return norm(a.status) !== 'closed';
  }

  function pri(a) {
    return String(a.priority || 'Medium').trim() || 'Medium';
  }

  function priClass(p) {
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
      critical: open.filter(a => pri(a) === 'Critical').length,
      high: open.filter(a => pri(a) === 'High').length,
      medium: open.filter(a => pri(a) === 'Medium').length,
      low: open.filter(a => pri(a) === 'Low').length,
      closed: actions.filter(a => !isOpen(a)).length
    };
  }

  function filtered(actions, filter) {
    if (!filter || filter === 'open') return actions.filter(isOpen);
    if (filter === 'closed') return actions.filter(a => !isOpen(a));
    return actions.filter(a => isOpen(a) && pri(a).toLowerCase() === filter);
  }

  function date(v) {
    if (!v) return 'Not set';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toLocaleDateString();
  }

  function card(a) {
    const p = pri(a);
    return `<div class="fire-s-action-card-v1033 priority-${priClass(p)}">
      <div class="fire-s-action-top-v1033">
        <div><strong>${esc(a.actionId || 'Action')}</strong><span>${esc(a.status || 'Open')}</span></div>
        <b>${esc(p)}</b>
      </div>
      <div class="fire-s-action-question-v1033">${esc(a.question || a.finding || 'Action item')}</div>
      ${a.finding && a.finding !== a.question ? `<div class="fire-s-action-finding-v1033">${esc(a.finding)}</div>` : ''}
      <div class="fire-s-action-meta-v1033">
        <div><span>Responsible</span><strong>${esc(a.responsible || 'Not assigned')}</strong></div>
        <div><span>Due</span><strong>${esc(date(a.dueDate))}</strong></div>
        <div><span>Section</span><strong>${esc(a.sectionName || 'Checklist')}</strong></div>
        <div><span>Source</span><strong>Checklist NO</strong></div>
      </div>
      <div class="fire-s-action-buttons-v1034">
        <button type="button" data-edit-action="${esc(a.actionId)}">Update / Resolve</button>
      </div>
    </div>`;
  }

  function render(filter = 'open') {
    const panel = document.getElementById('fireSActionRegisterPanelV1033');
    if (!panel) return false;

    const project = syncActionsToProject();
    const actions = Array.isArray(project?.actions) ? project.actions : [];
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
      button.addEventListener('click', () => render(button.dataset.actionFilter));
    });

    panel.querySelectorAll('[data-edit-action]').forEach(button => {
      button.addEventListener('click', () => {
        if (window.FireSActionRegister?.openEditor) {
          window.FireSActionRegister.openEditor(button.dataset.editAction);
        }
      });
    });

    if (window.FireSPremisesWorkspace?.inject) {
      setTimeout(() => window.FireSPremisesWorkspace.inject(false), 50);
    }

    return true;
  }

  function patch() {
    if (window.FireSActionRegister && !window.FireSActionRegister.hardFixed1053) {
      window.FireSActionRegister.originalRender1053 = window.FireSActionRegister.render;
      window.FireSActionRegister.render = function fixed(filter) {
        return render(filter || document.getElementById('fireSActionRegisterPanelV1033')?.dataset.filter || 'open');
      };
      window.FireSActionRegister.hardFixed1053 = true;
    }
  }

  function run() {
    patch();
    render(document.getElementById('fireSActionRegisterPanelV1033')?.dataset.filter || 'open');
  }

  document.addEventListener('change', event => {
    if (event.target?.classList?.contains('answer-select')) {
      setTimeout(run, 80);
      setTimeout(run, 350);
    }
  });

  document.addEventListener('click', event => {
    if (event.target?.id === 'fireSRefreshActionRegisterV1033') {
      setTimeout(run, 50);
    }
  });

  window.FireSActionRegisterHardFix = { run, render, syncActionsToProject };

  setTimeout(run, 900);
  setTimeout(run, 2000);
  setTimeout(run, 3500);
})();
