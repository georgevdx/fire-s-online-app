
/* Fire-S v105.1 Action Sync Fix
   Fixes Action Register / Workspace counters staying on 0.
   Creates or derives actions from existing NO checklist answers and writes them to project.actions.
*/

(function () {
  function currentProject() {
    if (typeof currentProjectId === 'undefined' || !currentProjectId) return null;
    if (typeof getProjects !== 'function') return null;
    return getProjects().find(project => project.id === currentProjectId) || null;
  }

  function currentProjectIndex(projects) {
    if (typeof currentProjectId === 'undefined' || !currentProjectId) return -1;
    return projects.findIndex(project => project.id === currentProjectId);
  }

  function clean(value) {
    return String(value || '').trim();
  }

  function normal(value) {
    return clean(value).toLowerCase();
  }

  function todayPlus(days) {
    const date = new Date();
    date.setDate(date.getDate() + Number(days || 30));
    return date.toISOString().slice(0, 10);
  }

  function getChecklistItems() {
    if (typeof getActiveTemplateChecklist === 'function') {
      const checklist = getActiveTemplateChecklist();
      if (Array.isArray(checklist) && checklist.length) return checklist;
    }

    if (Array.isArray(window.checklists) && window.checklists.length) {
      return window.checklists;
    }

    if (typeof checklists !== 'undefined' && Array.isArray(checklists)) {
      return checklists;
    }

    return [];
  }

  function itemForAnswer(answer, index) {
    const checklist = getChecklistItems();

    const itemIndex =
      Number.isFinite(Number(answer?.itemIndex))
        ? Number(answer.itemIndex)
        : index;

    return checklist[itemIndex] || {};
  }

  function sectionFor(item, answer) {
    return (
      item.sectionName ||
      item._sectionName ||
      answer?.sectionName ||
      answer?.category ||
      'Inspection'
    );
  }

  function ruleFor(item, answer) {
    const section = sectionFor(item, answer);
    const question = item["Checklist Item"] || answer?.question || '';

    if (window.FireSActionEngine?.findRule) {
      return window.FireSActionEngine.findRule(section, question, item);
    }

    const text = `${section} ${question}`.toLowerCase();

    if (text.includes('extinguisher') || text.includes('fire equipment')) {
      return { priority: 'Critical', responsible: 'Approved Contractor', dueDays: 14 };
    }

    if (text.includes('escape') || text.includes('exit door')) {
      return { priority: 'Critical', responsible: 'Building Owner', dueDays: 7 };
    }

    if (text.includes('lighting') || text.includes('alarm') || text.includes('detection')) {
      return { priority: 'High', responsible: 'Approved Contractor', dueDays: 21 };
    }

    return {
      priority: item.Severity || 'High',
      responsible: 'Building Owner',
      dueDays: 30
    };
  }

  function actionKey(project, answer, item, index) {
    const itemIndex =
      Number.isFinite(Number(answer?.itemIndex))
        ? Number(answer.itemIndex)
        : index;

    return [
      project.id,
      itemIndex,
      answer?.itemNumber || item["Item Number"] || String(itemIndex + 1),
      normal(item["Checklist Item"] || answer?.question || answer?.item || '')
    ].join('|');
  }

  function nextId(existing = []) {
    if (window.FireSActionEngine?.nextActionId) {
      return window.FireSActionEngine.nextActionId(existing);
    }

    const year = new Date().getFullYear();
    const key = `fires_action_counter_${year}`;
    const next = Number(localStorage.getItem(key) || '0') + 1;
    localStorage.setItem(key, String(next));
    return `AC-${year}-${String(next).padStart(6, '0')}`;
  }

  function buildAction(project, answer, item, index, existingActions) {
    const rule = ruleFor(item, answer);
    const itemIndex =
      Number.isFinite(Number(answer?.itemIndex))
        ? Number(answer.itemIndex)
        : index;

    const question =
      item["Checklist Item"] ||
      answer?.question ||
      answer?.item ||
      `Checklist item ${itemIndex + 1}`;

    const created = new Date().toISOString();

    return {
      actionId: nextId(existingActions),
      actionKey: actionKey(project, answer, item, index),
      premisesId: project.id,
      inspectionId: project.id,
      inspectionNumber: project.inspectionNumber || '',
      itemIndex,
      itemNumber: answer?.itemNumber || item["Item Number"] || String(itemIndex + 1),
      sectionName: sectionFor(item, answer),
      question,
      finding:
        item["Non Compliance Text"] ||
        answer?.note ||
        question,
      correctiveAction: item["Corrective Action"] || '',
      reference: item.Reference || '',
      priority: item.Severity || rule.priority || 'High',
      responsible: rule.responsible || 'Building Owner',
      dueDate: todayPlus(rule.dueDays),
      status: 'Open',
      createdDate: created,
      createdBy: project.inspectorName || '',
      closedDate: '',
      closedBy: '',
      closeComment: '',
      photosBefore: [],
      photosAfter: [],
      comments: [],
      history: [
        {
          event: 'Created',
          date: created,
          note: 'Created automatically from existing NO checklist answer.'
        }
      ]
    };
  }

  function syncProject(project) {
    if (!project) return project;

    const existing = Array.isArray(project.actions) ? [...project.actions] : [];
    const answers = Array.isArray(project.answers) ? project.answers : [];
    const noKeys = new Set();
    let actions = [...existing];
    let changed = false;

    answers.forEach((answer, index) => {
      if (normal(answer?.answer) !== 'no') return;

      const item = itemForAnswer(answer, index);
      const key = actionKey(project, answer, item, index);
      noKeys.add(key);

      const openExisting = actions.find(action =>
        action.actionKey === key &&
        normal(action.status) !== 'closed'
      );

      if (openExisting) return;

      const closedExistingIndex = actions.findIndex(action =>
        action.actionKey === key &&
        normal(action.status) === 'closed'
      );

      if (closedExistingIndex !== -1) {
        actions[closedExistingIndex] = {
          ...actions[closedExistingIndex],
          status: 'Open',
          closedDate: '',
          closedBy: '',
          closeComment: '',
          history: [
            ...(actions[closedExistingIndex].history || []),
            {
              event: 'Reopened',
              date: new Date().toISOString(),
              note: 'Checklist answer is NO again.'
            }
          ]
        };
        changed = true;
        return;
      }

      actions.push(buildAction(project, answer, item, index, actions));
      changed = true;
    });

    actions = actions.map(action => {
      if (
        normal(action.status) !== 'closed' &&
        action.actionKey &&
        action.inspectionId === project.id &&
        !noKeys.has(action.actionKey)
      ) {
        changed = true;

        return {
          ...action,
          status: 'Closed',
          closedDate: new Date().toISOString(),
          closeComment: action.closeComment || 'Checklist answer is no longer NO.',
          history: [
            ...(action.history || []),
            {
              event: 'Closed',
              date: new Date().toISOString(),
              note: 'Checklist answer is no longer NO.'
            }
          ]
        };
      }

      return action;
    });

    if (!changed && existing.length === actions.length) return project;

    return {
      ...project,
      actions,
      actionEngineUpdatedAt: new Date().toISOString(),
      syncPending: true,
      lastSaved: project.lastSaved || new Date().toISOString()
    };
  }

  function syncCurrentProject(options = {}) {
    if (typeof getProjects !== 'function' || typeof setProjects !== 'function') return;

    const projects = getProjects();
    const index = currentProjectIndex(projects);
    if (index === -1) return;

    const before = JSON.stringify(projects[index].actions || []);
    const updated = syncProject(projects[index]);
    const after = JSON.stringify(updated.actions || []);

    if (before === after && projects[index].actionEngineUpdatedAt === updated.actionEngineUpdatedAt) return;

    projects[index] = updated;
    setProjects(projects);

    if (typeof currentProject !== 'undefined' && currentProject?.id === updated.id) {
      currentProject = updated;
    }

    if (window.FireSActionRegister?.render) {
      window.FireSActionRegister.render(
        document.getElementById('fireSActionRegisterPanelV1033')?.dataset.filter || 'open'
      );
    }

    if (window.FireSPremisesWorkspace?.inject) {
      window.FireSPremisesWorkspace.inject(false);
    }

    if (options.renderList !== false && typeof renderProjectsList === 'function') {
      renderProjectsList();
    }
  }

  function patchSaveFunctions() {
    if (typeof autoSaveProject === 'function' && !window.fireSOriginalAutoSaveProject1051) {
      window.fireSOriginalAutoSaveProject1051 = autoSaveProject;
      autoSaveProject = function fireSAutoSaveWithActionSync1051() {
        const result = window.fireSOriginalAutoSaveProject1051.apply(this, arguments);
        setTimeout(() => syncCurrentProject({ renderList: false }), 80);
        return result;
      };
    }

    if (typeof saveProject === 'function' && !window.fireSOriginalSaveProject1051) {
      window.fireSOriginalSaveProject1051 = saveProject;
      saveProject = function fireSSaveWithActionSync1051() {
        syncCurrentProject({ renderList: false });
        const result = window.fireSOriginalSaveProject1051.apply(this, arguments);
        setTimeout(() => syncCurrentProject(), 120);
        return result;
      };
    }

    if (typeof finishProject === 'function' && !window.fireSOriginalFinishProject1051) {
      window.fireSOriginalFinishProject1051 = finishProject;
      finishProject = function fireSFinishWithActionSync1051() {
        syncCurrentProject({ renderList: false });
        const result = window.fireSOriginalFinishProject1051.apply(this, arguments);
        setTimeout(() => syncCurrentProject(), 120);
        return result;
      };
    }
  }

  function bindAnswerChanges() {
    document.querySelectorAll('.answer-select').forEach(field => {
      if (field.dataset.fireSActionSyncFixBound === 'true') return;
      field.dataset.fireSActionSyncFixBound = 'true';

      field.addEventListener('change', () => {
        setTimeout(() => syncCurrentProject({ renderList: false }), 120);
      });
    });
  }

  function run() {
    patchSaveFunctions();
    bindAnswerChanges();
    syncCurrentProject({ renderList: false });
  }

  window.FireSActionSyncFix = {
    run,
    syncCurrentProject,
    syncProject
  };

  setTimeout(run, 800);
  setTimeout(run, 1800);
  setInterval(bindAnswerChanges, 2000);
})();
