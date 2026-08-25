/* Fire-S Sprint 109.3 - Trend Analytics
   Integrated add-on: reads Inspection History + current inspection and renders practical trends per premises. */
(function () {
  'use strict';

  const VERSION = '109.3-trend-analytics';

  function esc(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value || '');
    return String(value || '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function projects() {
    try {
      return typeof getProjects === 'function' ? getProjects() : JSON.parse(localStorage.getItem('fireyeProjects') || '[]');
    } catch (err) {
      console.warn('Sprint 109.3 could not read projects', err);
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

  function inspectionDate(inspection) {
    return inspection?.inspectionDate || inspection?.completedAt || inspection?.archivedAt || inspection?.lastSaved || inspection?.currentInspectionStartedAt || '';
  }

  function answerValue(answer) {
    return String(answer?.answer || '').trim().toLowerCase();
  }

  function answers(inspection) {
    return Array.isArray(inspection?.answers) ? inspection.answers : [];
  }

  function noItems(inspection) {
    return answers(inspection).filter(a => answerValue(a) === 'no');
  }

  function answeredCount(inspection) {
    return answers(inspection).filter(a => ['yes', 'no', 'n/a'].includes(answerValue(a))).length;
  }

  function compliance(inspection) {
    const yesNo = answers(inspection).filter(a => ['yes', 'no'].includes(answerValue(a)));
    if (!yesNo.length) return 0;
    const yes = yesNo.filter(a => answerValue(a) === 'yes').length;
    return Math.round((yes / yesNo.length) * 100);
  }

  function health(score) {
    if (score >= 96) return 'Excellent';
    if (score >= 90) return 'Very Good';
    if (score >= 80) return 'Good';
    if (score >= 70) return 'Needs Attention';
    if (score >= 60) return 'Poor';
    return 'Critical';
  }

  function issueKey(answer) {
    return String(answer?.itemNumber || answer?.itemIndex || answer?.question || answer?.checklistItem || answer?.itemText || '').trim();
  }

  function issueText(answer) {
    return answer?.question || answer?.checklistItem || answer?.itemText || `Checklist item ${answer?.itemNumber || answer?.itemIndex || ''}`;
  }

  function issueCategory(answer) {
    return answer?.category || answer?.section || answer?.group || 'Uncategorised';
  }

  function allInspections(project) {
    const history = Array.isArray(project?.inspectionHistory) ? project.inspectionHistory.slice() : [];
    const currentHasData = answeredCount(project) > 0 || noItems(project).length > 0 || Array.isArray(project?.photos) && project.photos.length > 0;
    const current = currentHasData ? [{
      ...project,
      id: project.currentInspectionId || project.inspectionId || project.id,
      status: project.completedAt ? 'Completed' : (project.currentInspectionStatus || 'Draft'),
      isCurrent: true
    }] : [];

    return history.concat(current)
      .filter(Boolean)
      .sort((a, b) => {
        const ad = new Date(inspectionDate(a) || 0).getTime() || 0;
        const bd = new Date(inspectionDate(b) || 0).getTime() || 0;
        return ad - bd;
      });
  }

  function trendDirection(first, last, tolerance) {
    const diff = last - first;
    if (diff > (tolerance || 0)) return 'improving';
    if (diff < -(tolerance || 0)) return 'declining';
    return 'stable';
  }

  function signalText(direction, metric) {
    if (direction === 'improving') return `${metric} improving`;
    if (direction === 'declining') return `${metric} declining`;
    return `${metric} stable`;
  }

  function buildTrend(project) {
    const inspections = allInspections(project);
    const points = inspections.map((inspection, index) => ({
      index,
      id: inspection.id || inspection.inspectionId || `inspection-${index}`,
      label: inspection.inspectionNumber || (inspection.isCurrent ? 'Current' : `Inspection ${index + 1}`),
      date: inspectionDate(inspection),
      compliance: compliance(inspection),
      openActions: noItems(inspection).length,
      answered: answeredCount(inspection),
      photos: Array.isArray(inspection.photos) ? inspection.photos.length : 0,
      health: health(compliance(inspection)),
      isCurrent: !!inspection.isCurrent,
      inspection
    }));

    const repeated = new Map();
    inspections.forEach(inspection => {
      noItems(inspection).forEach(item => {
        const key = issueKey(item);
        if (!key) return;
        const existing = repeated.get(key) || { key, text: issueText(item), category: issueCategory(item), count: 0 };
        existing.count += 1;
        repeated.set(key, existing);
      });
    });

    const repeatedItems = Array.from(repeated.values()).filter(item => item.count >= 2).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
    const first = points[0] || null;
    const last = points[points.length - 1] || null;
    const complianceDirection = first && last ? trendDirection(first.compliance, last.compliance, 2) : 'stable';
    const actionDirection = first && last ? trendDirection(first.openActions, last.openActions, 0) : 'stable';
    const avg = points.length ? Math.round(points.reduce((sum, p) => sum + p.compliance, 0) / points.length) : 0;

    return {
      points,
      first,
      last,
      averageCompliance: avg,
      complianceDirection,
      actionDirection,
      repeatedItems,
      signals: [
        signalText(complianceDirection, 'Compliance'),
        actionDirection === 'declining' ? 'Open actions increasing' : actionDirection === 'improving' ? 'Open actions reducing' : 'Open actions stable',
        repeatedItems.length ? `${repeatedItems.length} repeated issue${repeatedItems.length === 1 ? '' : 's'} detected` : 'No repeated issues detected'
      ]
    };
  }

  function sparkline(points, field, inverse) {
    if (!points.length) return '<div class="s1093-empty">No trend data.</div>';
    const max = Math.max(1, ...points.map(p => Number(p[field]) || 0));
    return `<div class="s1093-spark">${points.slice(-8).map(p => {
      const raw = Number(p[field]) || 0;
      const height = field === 'compliance' ? Math.max(6, Math.min(100, raw)) : Math.max(6, Math.round((raw / max) * 100));
      const title = `${p.label} (${fmtDate(p.date)}): ${raw}${field === 'compliance' ? '%' : ''}`;
      return `<div class="s1093-bar-wrap" title="${esc(title)}"><span class="s1093-bar ${inverse ? 'inverse' : ''}" style="height:${height}%"></span><small>${esc(String(p.date || '').slice(5, 10) || p.index + 1)}</small></div>`;
    }).join('')}</div>`;
  }

  function metricCard(label, value, sub, cls) {
    return `<div class="s1093-metric ${esc(cls || '')}"><span>${esc(label)}</span><strong>${esc(value)}</strong><em>${esc(sub || '')}</em></div>`;
  }

  function renderRepeated(items) {
    if (!items.length) return '<div class="s1093-empty">No repeated action items identified across inspections.</div>';
    return `<ul class="s1093-repeat-list">${items.slice(0, 6).map(item => `<li><strong>${esc(item.count + 'x')}</strong><span>${esc(item.text)}</span><em>${esc(item.category)}</em></li>`).join('')}</ul>`;
  }

  function renderTimeline(points) {
    if (!points.length) return '<div class="s1093-empty">No inspections available yet.</div>';
    return `<div class="s1093-timeline">${points.slice(-5).map(point => `
      <div class="s1093-time-row ${point.isCurrent ? 'current' : ''}">
        <div><strong>${esc(point.label)}</strong><span>${esc(fmtDate(point.date))}${point.isCurrent ? ' · Current' : ''}</span></div>
        <div><span>${point.compliance}%</span><span>${point.openActions} actions</span><span>${esc(point.health)}</span></div>
      </div>`).join('')}</div>`;
  }

  function renderTrendPanel(projectId) {
    const project = findProject(projectId);
    if (!project) return;

    const old = document.getElementById('sprint1093TrendPanel');
    if (old) old.remove();

    const form = document.getElementById('projectFormSection');
    if (!form) return;

    const trend = buildTrend(project);
    const points = trend.points;
    const enough = points.length >= 2;
    const latest = trend.last;
    const first = trend.first;
    const complianceDelta = first && latest ? latest.compliance - first.compliance : 0;
    const actionDelta = first && latest ? latest.openActions - first.openActions : 0;

    const panel = document.createElement('div');
    panel.id = 'sprint1093TrendPanel';
    panel.className = 's1093-trend-panel';
    panel.innerHTML = `
      <div class="s1093-header">
        <div>
          <h3>Trend Analytics</h3>
          <p>Tracks compliance, action load and repeated issues across this premises' inspection history.</p>
        </div>
        <span class="s1093-version">Sprint ${VERSION}</span>
      </div>
      ${enough ? `
        <div class="s1093-metrics">
          ${metricCard('Latest Compliance', latest.compliance + '%', trend.complianceDirection, trend.complianceDirection)}
          ${metricCard('Compliance Change', (complianceDelta > 0 ? '+' : '') + complianceDelta + '%', 'since first record', complianceDelta >= 0 ? 'improving' : 'declining')}
          ${metricCard('Open Actions', String(latest.openActions), (actionDelta > 0 ? '+' : '') + actionDelta + ' since first record', actionDelta <= 0 ? 'improving' : 'declining')}
          ${metricCard('Average Compliance', trend.averageCompliance + '%', points.length + ' inspection records', 'stable')}
        </div>
        <div class="s1093-grid">
          <div class="s1093-chart-card"><h4>Compliance Trend</h4>${sparkline(points, 'compliance', false)}</div>
          <div class="s1093-chart-card"><h4>Open Actions Trend</h4>${sparkline(points, 'openActions', true)}</div>
        </div>
        <div class="s1093-signals">
          ${trend.signals.map(signal => `<span>${esc(signal)}</span>`).join('')}
        </div>
        <div class="s1093-grid">
          <div class="s1093-chart-card"><h4>Last 5 Inspections</h4>${renderTimeline(points)}</div>
          <div class="s1093-chart-card"><h4>Repeated Action Items</h4>${renderRepeated(trend.repeatedItems)}</div>
        </div>` : `
        <div class="s1093-empty s1093-large-empty">
          Trend Analytics will activate when this premises has at least two inspection records. Start a new inspection after completing the current one to build the trend line.
        </div>
        <div class="s1093-grid">
          <div class="s1093-chart-card"><h4>Current Snapshot</h4>${renderTimeline(points)}</div>
          <div class="s1093-chart-card"><h4>Repeated Action Items</h4>${renderRepeated(trend.repeatedItems)}</div>
        </div>`}
    `;

    const comparison = document.getElementById('sprint1092ComparisonPanel');
    if (comparison) comparison.insertAdjacentElement('afterend', panel);
    else {
      const history = document.getElementById('sprint109HistoryPanel');
      if (history) history.insertAdjacentElement('afterend', panel);
      else {
        const quick = document.getElementById('inspectionQuickActions');
        if (quick) quick.insertAdjacentElement('afterend', panel);
        else form.prepend(panel);
      }
    }
  }

  function install() {
    const originalOpen = window.openProject;
    if (typeof originalOpen === 'function' && !originalOpen.__s1093Wrapped) {
      const wrapped = function(projectId, focusMode) {
        const result = originalOpen.apply(this, arguments);
        setTimeout(() => renderTrendPanel(projectId), 520);
        return result;
      };
      wrapped.__s1093Wrapped = true;
      window.openProject = wrapped;
    }

    window.FireSTrends1093 = {
      version: VERSION,
      buildTrend,
      render: renderTrendPanel
    };

    console.log('Fire-S Sprint 109.3 installed:', VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(install, 360));
  } else {
    setTimeout(install, 360);
  }
})();
