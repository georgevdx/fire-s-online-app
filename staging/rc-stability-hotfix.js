/* Fire-S v119 RC Core Stability
   Scope: delete inspection integrity, clean active context, read-only archive lock.
   This file intentionally patches behaviour at the edge without deleting premises data.
*/
(function () {
  'use strict';

  const VERSION = 'v119-rc-core-stability';
  const PROJECTS_KEY = 'fireyeProjects';

  function log(...args) {
    console.log('[Fire-S RC Stability]', ...args);
  }

  function safeJsonParse(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; }
    catch (_) { return fallback; }
  }

  function getProjectsSafe() {
    if (typeof window.getProjects === 'function') {
      try {
        const projects = window.getProjects();
        if (Array.isArray(projects)) return projects;
      } catch (error) {
        console.warn('getProjects failed, using localStorage fallback', error);
      }
    }
    return safeJsonParse(localStorage.getItem(PROJECTS_KEY), []);
  }

  function setProjectsSafe(projects) {
    if (!Array.isArray(projects)) return;
    if (typeof window.setProjects === 'function') {
      try {
        window.setProjects(projects);
        return;
      } catch (error) {
        console.warn('setProjects failed, using localStorage fallback', error);
      }
    }
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  }

  function getCurrentProjectId() {
    return window.currentProjectId || null;
  }

  function setCurrentProject(project) {
    window.currentProjectId = project ? project.id : null;
    window.currentProject = project || null;
    if (!project) {
      window.currentPhotos = [];
      return;
    }
    window.currentPhotos = Array.isArray(project.photos) ? project.photos : [];
  }

  function asDateTime(value) {
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function inspectionDateValue(inspection) {
    return asDateTime(
      inspection?.deletedAt ||
      inspection?.completedAt ||
      inspection?.archivedAt ||
      inspection?.lastSaved ||
      inspection?.inspectionDate ||
      inspection?.currentInspectionStartedAt
    );
  }

  function getLatestHistoryIndex(history) {
    if (!Array.isArray(history) || history.length === 0) return -1;
    let bestIndex = 0;
    let bestTime = inspectionDateValue(history[0]);
    history.forEach((item, index) => {
      const time = inspectionDateValue(item);
      if (time > bestTime) {
        bestIndex = index;
        bestTime = time;
      }
    });
    return bestIndex;
  }

  function activeInspectionHasData(project) {
    if (!project) return false;
    return Boolean(
      (Array.isArray(project.answers) && project.answers.length > 0) ||
      (Array.isArray(project.photos) && project.photos.length > 0) ||
      String(project.finalComments || '').trim() ||
      String(project.followUpNotes || '').trim() ||
      project.completedAt ||
      project.archivedAt ||
      project.currentInspectionStartedAt ||
      project.inspectionNumber
    );
  }

  function createBlankInspectionShell(project) {
    const today = new Date().toISOString().slice(0, 10);
    return {
      ...project,
      inspectionNumber: '',
      inspectionDate: today,
      completedAt: null,
      archiveStatus: '',
      archivedAt: null,
      scheduledStatus: 'premises_only',
      scheduleFreshInspection: false,
      scheduledReason: '',
      scheduleType: '',
      scheduledNote: '',
      answers: [],
      photos: [],
      finalComments: '',
      followUpRequired: 'No',
      followUpDate: '',
      followUpNotes: '',
      repeatFindings: [],
      followUpFindingMode: false,
      followUpFindingIndexes: [],
      followUpSourceInspectionNumber: '',
      currentInspectionStatus: 'No active inspection',
      currentInspectionStartedAt: null,
      syncPending: true,
      syncError: false,
      lastSaved: new Date().toISOString()
    };
  }

  function restoreLatestHistoryAsCurrent(project) {
    const history = Array.isArray(project.inspectionHistory)
      ? project.inspectionHistory.slice()
      : [];

    const latestIndex = getLatestHistoryIndex(history);
    if (latestIndex === -1) {
      return createBlankInspectionShell(project);
    }

    const latest = history.splice(latestIndex, 1) || {};

    return {
      ...project,
      ...latest,
      id: project.id,
      companyId: project.companyId,
      companyName: project.companyName,
      createdByUserId: project.createdByUserId,
      createdByEmail: project.createdByEmail,
      siteId: project.siteId,
      inspectionHistory: history,
      currentInspectionStatus: latest.currentInspectionStatus || 'Restored previous inspection',
      syncPending: true,
      syncError: false,
      lastSaved: new Date().toISOString()
    };
  }

  function clearStaleUiContext() {
    window.fireSReadOnlyArchiveMode = false;

    ['siteHistoryPanel', 'inspectionArchivePanel', 'archivedInspectionDetailPanel', 'reportContentPdfClone'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    ['reportContent', 'photoPreview', 'analyticsContent'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });

    const reportSection = document.getElementById('reportSection');
    if (reportSection) reportSection.style.display = 'none';

    const saveMessage = document.getElementById('saveMessage');
    if (saveMessage) saveMessage.textContent = '';

    const commandCompany = document.getElementById('inspectionCommandCompany');
    const commandSite = document.getElementById('inspectionCommandSite');
    if (commandCompany) commandCompany.textContent = 'Company';
    if (commandSite) commandSite.textContent = 'Site';

    if (typeof window.closeGlobalActionDropdown === 'function') {
      try { window.closeGlobalActionDropdown(); } catch (_) {}
    }

    if (typeof window.closeInspectionArchivePanel === 'function') {
      try { window.closeInspectionArchivePanel(); } catch (_) {}
    }

    if (typeof window.closeArchivedInspectionDetail === 'function') {
      try { window.closeArchivedInspectionDetail(); } catch (_) {}
    }
  }

  function fillCleanNewInspectionFields() {
    const today = new Date().toISOString().slice(0, 10);
    const fieldValues = {
      inspectorName: '',
      inspectionDate: today,
      saveMessage: '',
      followUpRequired: 'No',
      followUpDate: '',
      followUpNotes: '',
      recurringCycleEnabled: 'No',
      recurringCycleNumber: '',
      recurringCycleUnit: '',
      recurringCycleNotes: '',
      finalComments: ''
    };

    Object.entries(fieldValues).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });

    document.querySelectorAll('.answer-select').forEach(field => { field.value = ''; });
    document.querySelectorAll('[id^="note_"]').forEach(field => { field.value = ''; });
    document.querySelectorAll('.expiry-date').forEach(field => { field.value = ''; });

    window.currentPhotos = [];
    if (typeof window.renderPhotos === 'function') {
      try { window.renderPhotos(); } catch (_) {}
    }
  }

  async function uploadProjectUpdate(project) {
    if (!project || !navigator.onLine || typeof window.uploadSingleInspection !== 'function') return;
    try {
      await window.uploadSingleInspection(project);
    } catch (error) {
      console.warn('Cloud update skipped/failed after integrity change:', error);
    }
  }

  async function rcDeleteActiveInspection() {
    if (typeof window.canEditInspection === 'function' && !window.canEditInspection()) {
      alert('Your access does not allow deleting inspections.');
      return;
    }

    const currentId = getCurrentProjectId();
    if (!currentId) {
      const msg = document.getElementById('saveMessage');
      if (msg) msg.textContent = 'Open an inspection first before deleting.';
      return;
    }

    const projects = getProjectsSafe();
    const index = projects.findIndex(project => String(project.id) === String(currentId));
    if (index === -1) {
      alert('The active inspection could not be found. Refresh and try again.');
      return;
    }

    const project = projects[index];
    const historyCount = Array.isArray(project.inspectionHistory) ? project.inspectionHistory.length : 0;
    const message = historyCount > 0
      ? 'Delete only the current/last inspection for this premises?\n\nThe premises, Building Passport and previous inspection history will remain.'
      : 'Delete only this inspection data?\n\nThe premises will remain as a blank premises record. The Building Passport will remain.';

    if (!confirm(message)) return;

    let updatedProject;
    if (historyCount > 0) {
      updatedProject = restoreLatestHistoryAsCurrent(project);
    } else {
      updatedProject = createBlankInspectionShell(project);
    }

    updatedProject.deletedInspectionAudit = [
      ...(Array.isArray(project.deletedInspectionAudit) ? project.deletedInspectionAudit : []),
      {
        deletedAt: new Date().toISOString(),
        deletedInspectionNumber: project.inspectionNumber || '',
        deletedInspectionDate: project.inspectionDate || '',
        reason: 'delete_current_inspection_only'
      }
    ];

    projects[index] = updatedProject;
    setProjectsSafe(projects);
    setCurrentProject(updatedProject);
    clearStaleUiContext();

    if (typeof window.renderProjectsList === 'function') {
      try { window.renderProjectsList(); } catch (_) {}
    }

    await uploadProjectUpdate(updatedProject);

    if (typeof window.openProject === 'function') {
      setTimeout(() => window.openProject(updatedProject.id, ''), 50);
    } else if (typeof window.showProjectList === 'function') {
      window.showProjectList();
    }

    setTimeout(() => {
      const msg = document.getElementById('saveMessage');
      if (msg) {
        msg.textContent = historyCount > 0
          ? 'Current inspection deleted. Premises kept and previous inspection restored.'
          : 'Inspection data deleted. Premises and Building Passport kept.';
      }
    }, 250);
  }

  function bindDeleteSafety() {
    const button = document.getElementById('deleteBtn');
    if (!button || button.dataset.rcDeleteSafetyBound === 'true') return;

    button.dataset.rcDeleteSafetyBound = 'true';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      rcDeleteActiveInspection();
    }, true);
  }

  function wrapOpenProject() {
    if (typeof window.openProject !== 'function' || window.openProject.__rcStabilityWrapped) return;

    const original = window.openProject;
    const wrapped = function (projectId, focusMode) {
      clearStaleUiContext();
      const result = original.apply(this, arguments);
      setTimeout(() => {
        const projects = getProjectsSafe();
        const active = projects.find(project => String(project.id) === String(window.currentProjectId || projectId));
        if (active) {
          setCurrentProject(active);
          const commandCompany = document.getElementById('inspectionCommandCompany');
          const commandSite = document.getElementById('inspectionCommandSite');
          if (commandCompany) commandCompany.textContent = active.organisationName || active.companyName || 'Company';
          if (commandSite) commandSite.textContent = active.siteName || active.projectName || 'Site';
        }
      }, 120);
      return result;
    };

    wrapped.__rcStabilityWrapped = true;
    window.openProject = wrapped;
  }

  function wrapStartNewInspectionForPremises() {
    if (typeof window.startNewInspectionForPremises !== 'function' || window.startNewInspectionForPremises.__rcStabilityWrapped) return;

    const original = window.startNewInspectionForPremises;
    const wrapped = function () {
      clearStaleUiContext();
      const result = original.apply(this, arguments);
      setTimeout(() => {
        fillCleanNewInspectionFields();
        window.fireSReadOnlyArchiveMode = false;
      }, 200);
      return result;
    };

    wrapped.__rcStabilityWrapped = true;
    window.startNewInspectionForPremises = wrapped;
  }

  function bindNewInspectionCleanStart() {
    ['newProjectBtn', 'scheduleNewInspectionBtn'].forEach(id => {
      const button = document.getElementById(id);
      if (!button || button.dataset.rcCleanStartBound === 'true') return;
      button.dataset.rcCleanStartBound = 'true';
      button.addEventListener('click', () => {
        clearStaleUiContext();
        setTimeout(() => {
          window.fireSReadOnlyArchiveMode = false;
        }, 50);
      }, true);
    });
  }

  function wrapArchiveReadOnly() {
    if (typeof window.viewArchivedInspection === 'function' && !window.viewArchivedInspection.__rcStabilityWrapped) {
      const originalView = window.viewArchivedInspection;
      const wrappedView = function () {
        window.fireSReadOnlyArchiveMode = true;
        const result = originalView.apply(this, arguments);
        setTimeout(() => {
          const panel = document.getElementById('archivedInspectionDetailPanel');
          if (panel && !panel.querySelector('.rc-read-only-banner')) {
            const banner = document.createElement('div');
            banner.className = 'rc-read-only-banner';
            banner.textContent = 'Archived Inspection – Read-only. Smart Actions, Continue Q&A, autosave and editing are disabled for this view.';
            panel.prepend(banner);
          }
          if (typeof window.updateProjectReadinessPanel === 'function') {
            try { window.updateProjectReadinessPanel(); } catch (_) {}
          }
        }, 100);
        return result;
      };
      wrappedView.__rcStabilityWrapped = true;
      window.viewArchivedInspection = wrappedView;
    }

    if (typeof window.closeArchivedInspectionDetail === 'function' && !window.closeArchivedInspectionDetail.__rcStabilityWrapped) {
      const originalClose = window.closeArchivedInspectionDetail;
      const wrappedClose = function () {
        window.fireSReadOnlyArchiveMode = false;
        const result = originalClose.apply(this, arguments);
        if (typeof window.updateProjectReadinessPanel === 'function') {
          try { window.updateProjectReadinessPanel(); } catch (_) {}
        }
        return result;
      };
      wrappedClose.__rcStabilityWrapped = true;
      window.closeArchivedInspectionDetail = wrappedClose;
    }
  }

  function wrapSmartActionsReadOnly() {
    if (typeof window.handleSmartQuickLink === 'function' && !window.handleSmartQuickLink.__rcStabilityWrapped) {
      const original = window.handleSmartQuickLink;
      const wrapped = function () {
        if (window.fireSReadOnlyArchiveMode || document.getElementById('archivedInspectionDetailPanel')) {
          alert('This is an archived inspection in read-only mode. Smart Actions and Continue Q&A are disabled.');
          return;
        }
        return original.apply(this, arguments);
      };
      wrapped.__rcStabilityWrapped = true;
      window.handleSmartQuickLink = wrapped;
    }

    if (typeof window.updateProjectReadinessPanel === 'function' && !window.updateProjectReadinessPanel.__rcStabilityWrapped) {
      const originalUpdate = window.updateProjectReadinessPanel;
      const wrappedUpdate = function () {
        if (window.fireSReadOnlyArchiveMode || document.getElementById('archivedInspectionDetailPanel')) {
          const quickSummary = document.getElementById('quickReadinessSummary');
          const oldPanel = document.getElementById('projectReadinessPanel');
          const html = '<div class="rc-read-only-banner">Archived Inspection – Read-only. Smart Actions and Continue Q&A are disabled.</div>';
          if (quickSummary) quickSummary.innerHTML = html;
          if (oldPanel) {
            oldPanel.style.display = 'block';
            oldPanel.innerHTML = html;
          }
          return;
        }
        return originalUpdate.apply(this, arguments);
      };
      wrappedUpdate.__rcStabilityWrapped = true;
      window.updateProjectReadinessPanel = wrappedUpdate;
    }
  }

  function injectStyles() {
    if (document.getElementById('rcStabilityStyles')) return;
    const style = document.createElement('style');
    style.id = 'rcStabilityStyles';
    style.textContent = `
      .rc-read-only-banner{background:#fff7ed;border:1px solid #fdba74;color:#9a3412;border-radius:12px;padding:12px 14px;margin:10px 0;font-weight:800;line-height:1.35;}
      @media(max-width:760px){
        html,body{max-width:100%;overflow-x:hidden;}
        .app{width:100%;max-width:100%;padding:8px;box-sizing:border-box;}
        .brand-header,.toolbar,.main-command-top,.inspection-command-header,.sticky-action-bar{gap:8px;flex-wrap:wrap;}
        .main-command-stats,.main-command-grid,.form-grid,.scheduling-card-grid,.services-grid{grid-template-columns:1fr!important;}
        .sticky-action-bar{left:0;right:0;width:100%;border-radius:14px 14px 0 0;}
        .action-dropdown{max-width:calc(100vw - 24px)!important;}
        input,select,textarea,button{max-width:100%;}
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    bindDeleteSafety();
    bindNewInspectionCleanStart();
    wrapOpenProject();
    wrapStartNewInspectionForPremises();
    wrapArchiveReadOnly();
    wrapSmartActionsReadOnly();

    window.rcDeleteActiveInspection = rcDeleteActiveInspection;
    window.rcClearStaleUiContext = clearStaleUiContext;

    setInterval(() => {
      bindDeleteSafety();
      bindNewInspectionCleanStart();
      wrapOpenProject();
      wrapStartNewInspectionForPremises();
      wrapArchiveReadOnly();
      wrapSmartActionsReadOnly();
    }, 1500);

    log(`${VERSION} loaded`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
