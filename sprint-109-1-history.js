/* Fire-S Sprint 109.1 - Inspection History & Versioning
   Safe integrated add-on: keeps Premises/Passport data permanent while each new inspection starts blank. */
(function () {
  'use strict';

  const VERSION = '109.1-inspection-history-versioning';

  function uid(prefix) {
    const base = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    return `${prefix || 'id'}-${base}`;
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function now() {
    return new Date().toISOString();
  }

  function esc(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value || '');
    return String(value || '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function projects() {
    try {
      return typeof getProjects === 'function' ? getProjects() : JSON.parse(localStorage.getItem('fireyeProjects') || '[]');
    } catch (err) {
      console.warn('Sprint 109.1 could not read projects', err);
      return [];
    }
  }

  function saveProjects(list) {
    if (typeof setProjects === 'function') return setProjects(list);
    localStorage.setItem('fireyeProjects', JSON.stringify(list || []));
  }

  function findProject(projectId) {
    return projects().find(item => String(item.id) === String(projectId));
  }

  function activeChecklistDataExists(project) {
    if (!project) return false;
    return (Array.isArray(project.answers) && project.answers.length > 0) ||
      (Array.isArray(project.photos) && project.photos.length > 0) ||
      !!project.finalComments ||
      !!project.followUpNotes ||
      !!project.completedAt ||
      !!project.lastSaved;
  }

  function countNo(inspection) {
    return (inspection?.answers || []).filter(answer => String(answer?.answer || '').trim().toLowerCase() === 'no').length;
  }

  function countAnswered(inspection) {
    return (inspection?.answers || []).filter(answer => ['yes', 'no', 'n/a'].includes(String(answer?.answer || '').trim().toLowerCase())).length;
  }

  function historyKey(item) {
    return String(item?.inspectionId || item?.id || item?.inspectionNumber || item?.sourceInspectionNumber || item?.archivedAt || '');
  }

  function buildInspectionSnapshot(project, reason) {
    const completed = project.completedAt || project.archivedAt || '';
    const inspectionId = project.currentInspectionId || project.inspectionId || uid('ins');

    return {
      id: inspectionId,
      inspectionId,
      version: VERSION,
      status: completed ? 'Completed' : (project.currentInspectionStatus || 'Draft'),
      archiveReason: reason || 'history_snapshot',
      archivedAt: now(),
      sourceProjectId: project.id || '',
      sourceInspectionNumber: project.inspectionNumber || '',
      inspectionNumber: project.inspectionNumber || '',
      inspectionDate: project.inspectionDate || completed.slice(0, 10) || project.lastSaved?.slice(0, 10) || today(),
      completedAt: completed,
      lastSaved: project.lastSaved || now(),
      inspectorName: project.inspectorName || '',
      projectName: project.projectName || '',
      organisationName: project.organisationName || '',
      siteName: project.siteName || '',
      streetNumber: project.streetNumber || '',
      addressLine: project.addressLine || '',
      projectAddress: project.projectAddress || '',
      gps: project.gps || '',
      inMall: project.inMall || 'No',
      mallName: project.mallName || '',
      unitNumber: project.unitNumber || '',
      contactPerson: project.contactPerson || '',
      contactTel: project.contactTel || '',
      contactEmail: project.contactEmail || '',
      productType: project.productType || '',
      inspectionType: project.inspectionType || '',
      occupancy: project.occupancy || '',
      answers: Array.isArray(project.answers) ? project.answers : [],
      photos: Array.isArray(project.photos) ? project.photos : [],
      finalComments: project.finalComments || '',
      followUpRequired: project.followUpRequired || 'No',
      followUpDate: project.followUpDate || '',
      followUpNotes: project.followUpNotes || '',
      actionCount: countNo(project),
      answeredCount: countAnswered(project),
      photoCount: Array.isArray(project.photos) ? project.photos.length : 0
    };
  }

  function archiveActiveInspection(project, reason) {
    const history = Array.isArray(project.inspectionHistory) ? project.inspectionHistory.slice() : [];
    if (!activeChecklistDataExists(project)) return history;

    const snapshot = buildInspectionSnapshot(project, reason);
    const key = historyKey(snapshot);
    const duplicateIndex = history.findIndex(item => historyKey(item) && historyKey(item) === key);

    if (duplicateIndex >= 0) {
      history[duplicateIndex] = { ...history[duplicateIndex], ...snapshot };
      return history;
    }

    return [...history, snapshot];
  }

  function nextInspectionNumber() {
    if (typeof generateInspectionNumber === 'function') return generateInspectionNumber();
    const year = new Date().getFullYear();
    const nums = projects()
      .flatMap(p => [p.inspectionNumber, ...(p.inspectionHistory || []).map(h => h.inspectionNumber)])
      .filter(Boolean)
      .map(v => parseInt(String(v).split('-').pop(), 10))
      .filter(Number.isFinite);
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return `FIR-${year}-${String(next).padStart(4, '0')}`;
  }

  function startBlankInspection(project) {
    return {
      ...project,
      currentInspectionId: uid('ins'),
      currentInspectionStatus: 'Draft',
      currentInspectionStartedAt: now(),
      inspectionNumber: nextInspectionNumber(),
      inspectionDate: today(),
      completedAt: null,
      archiveStatus: '',
      archivedAt: null,
      scheduledDate: '',
      scheduledStatus: 'in_progress',
      scheduleFreshInspection: false,
      scheduledReason: '',
      scheduleType: 'new_inspection',
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
      syncPending: true,
      syncError: false,
      lastSaved: now()
    };
  }

  function startNewInspectionForPremises109(projectId) {
    const list = projects();
    const index = list.findIndex(item => String(item.id) === String(projectId));

    if (index < 0) {
      alert('Could not find this premises. Please refresh and try again.');
      return;
    }

    const existing = list[index];
    const confirmed = confirm(
      'Start a new inspection for this existing premises?\n\nPremises information and the Building Passport will remain. The previous checklist answers, photos, comments and action items will be saved to Inspection History. The new inspection will start blank.'
    );

    if (!confirmed) return;

    const history = archiveActiveInspection(existing, 'new_inspection_started');
    list[index] = startBlankInspection({ ...existing, inspectionHistory: history });
    saveProjects(list);

    if (typeof renderProjectsList === 'function') renderProjectsList();
    if (typeof uploadSingleInspection === 'function' && navigator.onLine) {
      uploadSingleInspection(list[index]).catch(err => console.warn('Sprint 109.1 upload after new inspection failed', err));
    }

    if (typeof window.openProject === 'function') {
      window.openProject(list[index].id, '');
    }

    setTimeout(() => {
      const message = document.getElementById('saveMessage');
      if (message) message.textContent = 'New inspection started. Previous inspection moved to Inspection History; checklist is blank.';
      renderHistoryPanel(list[index].id);
    }, 120);
  }

  function sortedHistory(project) {
    return (project?.inspectionHistory || []).slice().sort((a, b) => {
      const ad = new Date(a.completedAt || a.inspectionDate || a.archivedAt || a.lastSaved || 0).getTime() || 0;
      const bd = new Date(b.completedAt || b.inspectionDate || b.archivedAt || b.lastSaved || 0).getTime() || 0;
      return bd - ad;
    });
  }

  function fmtDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toLocaleDateString();
  }

  function renderHistoryPanel(projectId) {
    const project = findProject(projectId);
    if (!project) return;

    const old = document.getElementById('sprint109HistoryPanel');
    if (old) old.remove();

    const form = document.getElementById('projectFormSection');
    if (!form) return;

    const history = sortedHistory(project);
    const currentStatus = project.completedAt ? 'Completed / Read only' : (project.currentInspectionStatus || 'Draft');
    const currentActionCount = countNo(project);
    const currentAnswered = countAnswered(project);
    const currentPhotos = Array.isArray(project.photos) ? project.photos.length : 0;

    const rows = history.length ? history.map((item) => {
      const realIndex = (project.inspectionHistory || []).indexOf(item);
      return `
        <div class="s109-history-row">
          <div>
            <strong>${esc(item.inspectionNumber || 'Previous Inspection')}</strong>
            <span>${esc(fmtDate(item.inspectionDate || item.completedAt || item.archivedAt))}</span>
          </div>
          <div class="s109-history-metrics">
            <span>${countAnswered(item)} answered</span>
            <span>${countNo(item)} actions</span>
            <span>${(item.photos || []).length} photos</span>
          </div>
          <div class="s109-history-actions">
            <button type="button" class="small-btn" onclick="viewArchivedInspection('${esc(project.id)}', ${realIndex})">View</button>
            <button type="button" class="small-btn primary-small-btn" onclick="generateArchivedInspectionReport('${esc(project.id)}', ${realIndex})">Report</button>
          </div>
        </div>`;
    }).join('') : '<div class="note">No previous inspections saved for this premises yet.</div>';

    const panel = document.createElement('div');
    panel.id = 'sprint109HistoryPanel';
    panel.className = 's109-history-panel';
    panel.innerHTML = `
      <div class="s109-history-header">
        <div>
          <h3>Inspection History & Versioning</h3>
          <p>Premises and Building Passport data remain permanent. Each new inspection receives blank answers and its own history record.</p>
        </div>
        <button type="button" class="primary-small-btn" onclick="startNewInspectionForPremises('${esc(project.id)}')">Start New Inspection</button>
      </div>
      <div class="s109-current-card ${project.completedAt ? 'is-readonly' : ''}">
        <div><span>Current Inspection</span><strong>${esc(project.inspectionNumber || '-')}</strong></div>
        <div><span>Status</span><strong>${esc(currentStatus)}</strong></div>
        <div><span>Answered</span><strong>${currentAnswered}</strong></div>
        <div><span>Open Actions</span><strong>${currentActionCount}</strong></div>
        <div><span>Photos</span><strong>${currentPhotos}</strong></div>
      </div>
      <div class="s109-history-list">${rows}</div>`;

    const quick = document.getElementById('inspectionQuickActions');
    if (quick) quick.insertAdjacentElement('afterend', panel);
    else form.prepend(panel);

    if (project.completedAt) enforceReadOnly(project);
  }

  function enforceReadOnly(project) {
    const form = document.getElementById('projectFormSection');
    if (!form || !project?.completedAt) return;

    let banner = document.getElementById('s109ReadOnlyBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 's109ReadOnlyBanner';
      banner.className = 's109-readonly-banner';
      banner.innerHTML = `
        <strong>Completed inspection opened in read-only mode.</strong>
        <span>Use Start New Inspection to continue work on this premises without changing the completed record.</span>`;
      form.prepend(banner);
    }

    form.querySelectorAll('.answer-select, [id^="note_"], .expiry-date, textarea, input[type="file"]').forEach(el => {
      el.disabled = true;
      el.classList.add('s109-disabled');
    });
  }

  function install() {
    const originalOpen = window.openProject;
    if (typeof originalOpen === 'function' && !originalOpen.__s109Wrapped) {
      const wrapped = function(projectId, focusMode) {
        const result = originalOpen.apply(this, arguments);
        setTimeout(() => {
          const project = typeof projectId === 'string' ? findProject(projectId) : null;
          if (project) renderHistoryPanel(project.id);
        }, 180);
        return result;
      };
      wrapped.__s109Wrapped = true;
      window.openProject = wrapped;
    }

    window.startNewInspectionForPremises = startNewInspectionForPremises109;
    window.FireSInspectionHistory109 = {
      version: VERSION,
      archiveActiveInspection,
      renderHistoryPanel,
      startNewInspectionForPremises: startNewInspectionForPremises109
    };

    console.log('Fire-S Sprint 109.1 installed:', VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(install, 250));
  } else {
    setTimeout(install, 250);
  }
})();
