/* Fire-S v2 Workspace Module */
(function(){ window.FireS && window.FireS.registerModule('workspace',{init(core){ window.FireS.workspace={open(id){ return typeof fireSRenderPremisesWorkspace==='function' ? fireSRenderPremisesWorkspace(id) : core.openInspectionForm(id);},startInspection(id){return core.openInspectionForm(id);}}; }}); })();


/* Fire-S Premises Intelligence v1.0 */
(function () {
  window.FireS = window.FireS || {};

  function ready(callback) {
    if (window.FireS.ready) return window.FireS.ready(callback);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback);
    else callback();
  }

  function dateKey(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  function dateText(value) {
    const key = dateKey(value);
    if (!key) return 'Not set';
    const date = new Date(key + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return key;
    return date.toLocaleDateString();
  }

  function title(project) {
    return (
      project?.projectName ||
      [project?.organisationName, project?.siteName].filter(Boolean).join(' - ') ||
      project?.siteName ||
      'Untitled Premises'
    );
  }

  function address(project) {
    return (
      project?.projectAddress ||
      (
        typeof combineStreetAddress === 'function'
          ? combineStreetAddress(project?.streetNumber, project?.addressLine)
          : [project?.streetNumber, project?.addressLine].filter(Boolean).join(' ')
      ) ||
      project?.addressLine ||
      'No address captured'
    );
  }

  function actions(project) {
    return Array.isArray(project?.answers)
      ? project.answers.filter(answer => String(answer?.answer || '').trim().toLowerCase() === 'no')
      : [];
  }

  function history(project) {
    return Array.isArray(project?.inspectionHistory) ? project.inspectionHistory : [];
  }

  function lastInspection(project) {
    const historyDates = history(project).map(item => item.completedAt || item.inspectionDate || item.archivedAt || '').filter(Boolean);
    const dates = [project?.completedAt, project?.inspectionDate, project?.lastSaved, ...historyDates].map(dateKey).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : '';
  }

  function nextInspection(project) {
    if (project?.scheduledDate) return project.scheduledDate;
    if (project?.followUpDate) return project.followUpDate;
    if (project?.recurringCycleEnabled && typeof getNextRecurringCycleDate === 'function') return getNextRecurringCycleDate(project);
    return '';
  }

  function isOverdue(project) {
    const next = dateKey(nextInspection(project));
    if (!next) return false;
    return next < new Date().toISOString().slice(0, 10);
  }

  function isDueSoon(project) {
    const next = dateKey(nextInspection(project));
    if (!next) return false;
    const nextDate = new Date(next + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
    return !Number.isNaN(days) && days >= 0 && days <= 30;
  }

  function score(project) {
    let value = 100;
    const openActions = actions(project).length;

    if (isOverdue(project)) value -= 25;
    else if (isDueSoon(project)) value -= 5;

    value -= Math.min(openActions * 6, 42);

    const missingData = [
      project?.projectAddress || project?.addressLine,
      project?.contactPerson,
      project?.contactTel
    ].filter(Boolean).length;

    if (missingData < 2) value -= 8;

    return Math.max(0, Math.min(100, value));
  }

  function grade(scoreValue) {
    if (scoreValue >= 95) return 'A+';
    if (scoreValue >= 90) return 'A';
    if (scoreValue >= 80) return 'B';
    if (scoreValue >= 70) return 'C';
    if (scoreValue >= 55) return 'D';
    return 'E';
  }

  function healthLabel(scoreValue) {
    if (scoreValue >= 90) return 'Healthy';
    if (scoreValue >= 75) return 'Attention';
    if (scoreValue >= 55) return 'At Risk';
    return 'Critical';
  }

  function healthClass(scoreValue) {
    if (scoreValue >= 90) return 'health-good';
    if (scoreValue >= 75) return 'health-attention';
    if (scoreValue >= 55) return 'health-risk';
    return 'health-critical';
  }

  function trendItems(project) {
    const items = [];

    history(project).slice().reverse().slice(0, 4).forEach(item => {
      const actionCount = Array.isArray(item.answers)
        ? item.answers.filter(answer => String(answer.answer || '').trim().toLowerCase() === 'no').length
        : 0;

      const pseudoProject = {
        ...project,
        answers: item.answers || [],
        completedAt: item.completedAt || item.inspectionDate || item.archivedAt
      };

      const s = Math.max(0, Math.min(100, 100 - Math.min(actionCount * 6, 42)));
      items.push({
        label: dateText(item.completedAt || item.inspectionDate || item.archivedAt),
        score: s
      });
    });

    items.unshift({
      label: 'Current',
      score: score(project)
    });

    return items.slice(0, 5);
  }

  function renderTrend(project) {
    const items = trendItems(project);

    return `
      <div class="pi-section">
        <div class="pi-section-title">Compliance Trend</div>
        <div class="pi-trend-list">
          ${items.map(item => `
            <div class="pi-trend-row">
              <span>${escapeHtml(item.label)}</span>
              <div class="pi-trend-bar"><i style="width:${item.score}%"></i></div>
              <strong>${item.score}%</strong>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderActionSummary(project) {
    const openActions = actions(project);
    const overdue = openActions.filter(action => {
      const due = dateKey(action.expiryDate || action.dueDate || action.followUpDate);
      return due && due < new Date().toISOString().slice(0, 10);
    }).length;

    const withDue = openActions.filter(action => action.expiryDate || action.dueDate || action.followUpDate).length;

    return `
      <div class="pi-section">
        <div class="pi-section-title">Action Summary</div>
        <div class="pi-action-summary">
          <div><span>Open</span><strong>${openActions.length}</strong></div>
          <div><span>Overdue</span><strong>${overdue}</strong></div>
          <div><span>With Due Date</span><strong>${withDue}</strong></div>
          <div><span>No Due Date</span><strong>${Math.max(0, openActions.length - withDue)}</strong></div>
        </div>
      </div>
    `;
  }

  function renderPhotoTimeline(project) {
    const currentPhotos = Array.isArray(project?.photos) ? project.photos.length : 0;
    const rows = [];

    if (currentPhotos > 0) {
      rows.push({ label: 'Current inspection', count: currentPhotos });
    }

    history(project).slice().reverse().slice(0, 5).forEach(item => {
      const count = Array.isArray(item.photos) ? item.photos.length : 0;
      if (count > 0) {
        rows.push({
          label: dateText(item.completedAt || item.inspectionDate || item.archivedAt),
          count
        });
      }
    });

    return `
      <div class="pi-section">
        <div class="pi-section-title">Photo Timeline</div>
        ${
          rows.length
            ? `<div class="pi-photo-timeline">${rows.map(row => `<div><span>${escapeHtml(row.label)}</span><strong>${row.count} photos</strong></div>`).join('')}</div>`
            : `<div class="pi-empty">No photos captured yet.</div>`
        }
      </div>
    `;
  }

  function renderIntelligence(project) {
    const s = score(project);
    const g = grade(s);
    const h = healthLabel(s);
    const cls = healthClass(s);

    return `
      <div class="premises-intelligence ${cls}">
        <div class="pi-health-card">
          <div>
            <span>Premises Score</span>
            <strong>${g}</strong>
            <small>${h}</small>
          </div>
          <b>${s}%</b>
        </div>

        <div class="pi-core-grid">
          <div><span>Last Inspection</span><strong>${escapeHtml(dateText(lastInspection(project)))}</strong></div>
          <div><span>Next Inspection</span><strong>${escapeHtml(dateText(nextInspection(project)))}</strong></div>
          <div><span>Open Actions</span><strong>${actions(project).length}</strong></div>
          <div><span>History</span><strong>${history(project).length}</strong></div>
        </div>

        ${renderTrend(project)}
        ${renderActionSummary(project)}
        ${renderPhotoTimeline(project)}
      </div>
    `;
  }

  function enhanceWorkspace() {
    const shell = document.querySelector('.premises-workspace-shell');
    if (!shell || shell.dataset.intelligenceApplied === 'true') return;

    const projectId = window.fireSWorkspacePremisesId;
    const projects = (window.FireS?.core?.getProjects && window.FireS.core.getProjects()) || (typeof getProjects === 'function' ? getProjects() : []);
    const project = projects.find(item => item.id === projectId);

    if (!project) return;

    shell.dataset.intelligenceApplied = 'true';

    const snapshot = shell.querySelector('.premises-snapshot-grid');
    if (snapshot) {
      snapshot.insertAdjacentHTML('afterend', renderIntelligence(project));
    }
  }

  function init() {
    window.FireS.premisesIntelligence = {
      renderIntelligence,
      enhanceWorkspace,
      score,
      grade
    };

    ready(function () {
      setInterval(enhanceWorkspace, 700);
    });
  }

  if (window.FireS.registerModule) {
    window.FireS.registerModule('premises-intelligence', { init });
  } else {
    init();
  }
})();
