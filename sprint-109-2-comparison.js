/* Fire-S Sprint 109.2 - Inspection Comparison
   Integrated add-on: compares current inspection against the most recent archived inspection for the same premises. */
(function () {
  'use strict';

  const VERSION = '109.2-inspection-comparison';

  function esc(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value || '');
    return String(value || '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function projects() {
    try {
      return typeof getProjects === 'function' ? getProjects() : JSON.parse(localStorage.getItem('fireyeProjects') || '[]');
    } catch (err) {
      console.warn('Sprint 109.2 could not read projects', err);
      return [];
    }
  }

  function findProject(projectId) {
    return projects().find(item => String(item.id) === String(projectId));
  }

  function fmtDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toLocaleDateString();
  }

  function answerValue(answer) {
    return String(answer?.answer || '').trim().toLowerCase();
  }

  function answered(inspection) {
    return (inspection?.answers || []).filter(a => ['yes', 'no', 'n/a'].includes(answerValue(a))).length;
  }

  function noItems(inspection) {
    return (inspection?.answers || []).filter(a => answerValue(a) === 'no');
  }

  function compliance(inspection) {
    const answers = inspection?.answers || [];
    const yesNo = answers.filter(a => ['yes', 'no'].includes(answerValue(a)));
    if (!yesNo.length) return 0;
    const yes = yesNo.filter(a => answerValue(a) === 'yes').length;
    return Math.round((yes / yesNo.length) * 100);
  }

  function inspectionDate(inspection) {
    return inspection?.inspectionDate || inspection?.completedAt || inspection?.archivedAt || inspection?.lastSaved || '';
  }

  function sortedHistory(project) {
    return (project?.inspectionHistory || []).slice().sort((a, b) => {
      const ad = new Date(inspectionDate(a) || 0).getTime() || 0;
      const bd = new Date(inspectionDate(b) || 0).getTime() || 0;
      return bd - ad;
    });
  }

  function keyFor(answer) {
    return String(answer?.itemNumber || answer?.itemIndex || answer?.question || '').trim();
  }

  function questionText(answer) {
    return answer?.question || answer?.checklistItem || answer?.itemText || `Checklist item ${answer?.itemNumber || answer?.itemIndex || ''}`;
  }

  function noKeySet(inspection) {
    const map = new Map();
    noItems(inspection).forEach(item => {
      const key = keyFor(item);
      if (key) map.set(key, item);
    });
    return map;
  }

  function compare(current, previous) {
    const currentNo = noKeySet(current);
    const previousNo = noKeySet(previous);

    const repeated = [];
    const newItems = [];
    const closed = [];

    currentNo.forEach((item, key) => {
      if (previousNo.has(key)) repeated.push(item);
      else newItems.push(item);
    });

    previousNo.forEach((item, key) => {
      if (!currentNo.has(key)) closed.push(item);
    });

    return {
      currentCompliance: compliance(current),
      previousCompliance: compliance(previous),
      currentActions: currentNo.size,
      previousActions: previousNo.size,
      currentAnswered: answered(current),
      previousAnswered: answered(previous),
      currentPhotos: Array.isArray(current?.photos) ? current.photos.length : 0,
      previousPhotos: Array.isArray(previous?.photos) ? previous.photos.length : 0,
      repeated,
      newItems,
      closed
    };
  }

  function deltaClass(value) {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  }

  function signed(value, suffix) {
    if (value > 0) return `+${value}${suffix || ''}`;
    if (value < 0) return `${value}${suffix || ''}`;
    return `0${suffix || ''}`;
  }

  function listItems(items, emptyText) {
    if (!items.length) return `<div class="s1092-empty">${esc(emptyText)}</div>`;
    return `<ul class="s1092-issue-list">${items.slice(0, 8).map(item => `<li><strong>${esc(item.itemNumber || item.itemIndex || '-')}</strong><span>${esc(questionText(item))}</span></li>`).join('')}</ul>`;
  }

  function renderComparisonPanel(projectId, selectedHistoryIndex) {
    const project = findProject(projectId);
    if (!project) return;

    const existing = document.getElementById('sprint1092ComparisonPanel');
    if (existing) existing.remove();

    const form = document.getElementById('projectFormSection');
    if (!form) return;

    const history = sortedHistory(project);
    const previous = typeof selectedHistoryIndex === 'number' ? (project.inspectionHistory || [])[selectedHistoryIndex] : history[0];

    const panel = document.createElement('div');
    panel.id = 'sprint1092ComparisonPanel';
    panel.className = 's1092-comparison-panel';

    if (!previous) {
      panel.innerHTML = `
        <div class="s1092-header">
          <div><h3>Inspection Comparison</h3><p>Complete at least one inspection history record before comparison is available.</p></div>
        </div>`;
    } else {
      const data = compare(project, previous);
      const complianceDelta = data.currentCompliance - data.previousCompliance;
      const actionDelta = data.currentActions - data.previousActions;
      const answeredDelta = data.currentAnswered - data.previousAnswered;
      const photoDelta = data.currentPhotos - data.previousPhotos;
      const historyOptions = history.map((item) => {
        const realIndex = (project.inspectionHistory || []).indexOf(item);
        const label = `${item.inspectionNumber || 'Inspection'} - ${fmtDate(inspectionDate(item))}`;
        const selected = item === previous ? 'selected' : '';
        return `<option value="${realIndex}" ${selected}>${esc(label)}</option>`;
      }).join('');

      panel.innerHTML = `
        <div class="s1092-header">
          <div>
            <h3>Inspection Comparison</h3>
            <p>Current inspection compared with a previous inspection for the same premises.</p>
          </div>
          <label class="s1092-select-label">Compare against
            <select onchange="window.FireSComparison1092.render('${esc(project.id)}', Number(this.value))">${historyOptions}</select>
          </label>
        </div>

        <div class="s1092-summary-grid">
          <div><span>Compliance</span><strong>${data.previousCompliance}% → ${data.currentCompliance}%</strong><em class="${deltaClass(complianceDelta)}">${signed(complianceDelta, '%')}</em></div>
          <div><span>Open Actions</span><strong>${data.previousActions} → ${data.currentActions}</strong><em class="${deltaClass(-actionDelta)}">${signed(actionDelta)}</em></div>
          <div><span>Answered</span><strong>${data.previousAnswered} → ${data.currentAnswered}</strong><em class="${deltaClass(answeredDelta)}">${signed(answeredDelta)}</em></div>
          <div><span>Photos</span><strong>${data.previousPhotos} → ${data.currentPhotos}</strong><em class="${deltaClass(photoDelta)}">${signed(photoDelta)}</em></div>
        </div>

        <div class="s1092-columns">
          <div>
            <h4>New Action Items</h4>
            ${listItems(data.newItems, 'No new action items compared with the selected previous inspection.')}
          </div>
          <div>
            <h4>Repeated Action Items</h4>
            ${listItems(data.repeated, 'No repeated action items found.')}
          </div>
          <div>
            <h4>Closed / Improved Items</h4>
            ${listItems(data.closed, 'No closed items detected yet.')}
          </div>
        </div>`;
    }

    const historyPanel = document.getElementById('sprint109HistoryPanel');
    if (historyPanel) historyPanel.insertAdjacentElement('afterend', panel);
    else {
      const quick = document.getElementById('inspectionQuickActions');
      if (quick) quick.insertAdjacentElement('afterend', panel);
      else form.prepend(panel);
    }
  }

  function install() {
    const originalOpen = window.openProject;
    if (typeof originalOpen === 'function' && !originalOpen.__s1092Wrapped) {
      const wrapped = function(projectId, focusMode) {
        const result = originalOpen.apply(this, arguments);
        setTimeout(() => renderComparisonPanel(projectId), 360);
        return result;
      };
      wrapped.__s1092Wrapped = true;
      window.openProject = wrapped;
    }

    window.FireSComparison1092 = {
      version: VERSION,
      render: renderComparisonPanel,
      compare
    };

    console.log('Fire-S Sprint 109.2 installed:', VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(install, 300));
  } else {
    setTimeout(install, 300);
  }
})();
