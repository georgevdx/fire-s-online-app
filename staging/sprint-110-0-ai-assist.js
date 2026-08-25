/* Fire-S Sprint 110.0 - AI Assist Foundation
   Offline/rule-based assistant layer. No external AI calls are made.
   Purpose: turn inspection answers, trends and actions into practical inspector guidance. */
(function () {
  'use strict';

  const VERSION = '110.0-ai-assist-foundation';

  function esc(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value || '');
    return String(value || '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function projects() {
    try {
      return typeof getProjects === 'function' ? getProjects() : JSON.parse(localStorage.getItem('fireyeProjects') || '[]');
    } catch (err) {
      console.warn('Sprint 110.0 could not read projects', err);
      return [];
    }
  }

  function findProject(projectId) {
    return projects().find(item => String(item.id) === String(projectId));
  }

  function answerValue(answer) {
    return String(answer?.answer || '').trim().toLowerCase();
  }

  function activeAnswers(project) {
    return Array.isArray(project?.answers) ? project.answers : [];
  }

  function activeNoItems(project) {
    return activeAnswers(project).filter(a => answerValue(a) === 'no');
  }

  function itemText(item) {
    return item?.question || item?.text || item?.label || item?.title || item?.requirement || item?.id || 'Inspection item';
  }

  function categoryOf(item) {
    return item?.category || item?.section || item?.group || item?.discipline || inferCategory(itemText(item));
  }

  function inferCategory(text) {
    const t = String(text || '').toLowerCase();
    if (/escape|exit|evac|egress|route|stair|door/.test(t)) return 'Means of Escape';
    if (/alarm|detect|smoke detector|manual call point|mcp/.test(t)) return 'Fire Detection';
    if (/sprinkler|pump|valve|water|hydrant|hose reel|booster/.test(t)) return 'Fire Water / Protection';
    if (/extinguisher|fire equipment|servic/.test(t)) return 'Fire Equipment';
    if (/electric|db|distribution board|cable|generator/.test(t)) return 'Electrical';
    if (/housekeeping|storage|combustible|waste/.test(t)) return 'Housekeeping';
    if (/document|certificate|coc|logbook|record|plan/.test(t)) return 'Documentation';
    return 'General';
  }

  function priorityFor(item) {
    const text = (itemText(item) + ' ' + categoryOf(item)).toLowerCase();
    if (/blocked|locked|isolated|failed|not working|inoperative|sprinkler.*off|pump.*fail|alarm.*fail|exit.*blocked|fire door.*wedged|emergency light.*fail/.test(text)) return 'Critical';
    if (/escape|exit|alarm|detect|sprinkler|hydrant|pump|fire door|emergency lighting|electrical db/.test(text)) return 'High';
    if (/extinguisher|hose reel|signage|combustible|storage|documentation|certificate|service/.test(text)) return 'Medium';
    return 'Low';
  }

  function recommendationFor(item) {
    const text = (itemText(item) + ' ' + categoryOf(item)).toLowerCase();
    if (/exit|escape|egress|route|stair/.test(text)) {
      return 'Clear and maintain the escape route immediately. Confirm that the route, exit doors and discharge path remain available for safe evacuation.';
    }
    if (/fire door|door/.test(text)) {
      return 'Repair or reinstate the fire door so that it closes and latches correctly. Remove wedges/hold-open arrangements unless connected to an approved release system.';
    }
    if (/alarm|detect|manual call point|mcp|smoke detector/.test(text)) {
      return 'Arrange inspection and testing by a competent fire detection contractor. Record the fault, corrective action and retest result.';
    }
    if (/sprinkler|pump|hydrant|hose reel|water/.test(text)) {
      return 'Arrange urgent inspection by a competent fire protection contractor. Confirm water supply, valves, pumps and firefighting equipment are serviceable.';
    }
    if (/extinguisher/.test(text)) {
      return 'Service, replace or reposition the extinguisher through a competent fire equipment contractor and update the service record/tag.';
    }
    if (/electric|db|distribution board|cable|generator/.test(text)) {
      return 'Refer the item to a competent electrical contractor. Remove combustible storage near electrical equipment and keep access to DBs clear.';
    }
    if (/housekeeping|storage|combustible|waste/.test(text)) {
      return 'Remove unnecessary combustible materials and maintain housekeeping controls. Keep ignition sources, exits and fire equipment clear.';
    }
    if (/document|certificate|coc|logbook|record|plan/.test(text)) {
      return 'Obtain and file the required documentation, service records or certificates. Keep the latest evidence available for audit and management review.';
    }
    return 'Assign the item to a responsible person, set a target date, close out with evidence, and verify completion during the next inspection.';
  }

  function compliance(project) {
    const yesNo = activeAnswers(project).filter(a => ['yes', 'no'].includes(answerValue(a)));
    if (!yesNo.length) return null;
    const yes = yesNo.filter(a => answerValue(a) === 'yes').length;
    return Math.round((yes / yesNo.length) * 100);
  }

  function categoryBreakdown(project) {
    const map = {};
    activeAnswers(project).forEach(item => {
      const ans = answerValue(item);
      if (!['yes', 'no'].includes(ans)) return;
      const cat = categoryOf(item);
      if (!map[cat]) map[cat] = { category: cat, yes: 0, no: 0, total: 0 };
      map[cat].total += 1;
      if (ans === 'yes') map[cat].yes += 1;
      if (ans === 'no') map[cat].no += 1;
    });
    return Object.values(map).map(row => ({
      ...row,
      score: row.total ? Math.round((row.yes / row.total) * 100) : 0
    })).sort((a, b) => a.score - b.score || b.no - a.no);
  }

  function history(project) {
    return Array.isArray(project?.inspectionHistory) ? project.inspectionHistory : [];
  }

  function trendSignal(project) {
    if (window.FireSTrends1093 && typeof window.FireSTrends1093.buildTrend === 'function') {
      try {
        const trend = window.FireSTrends1093.buildTrend(project);
        return trend?.signals || [];
      } catch (err) {
        console.warn('Sprint 110.0 could not read trend signals', err);
      }
    }
    return [];
  }

  function buildAssistant(project) {
    const noItems = activeNoItems(project);
    const comp = compliance(project);
    const cats = categoryBreakdown(project);
    const weakest = cats.slice(0, 3);
    const priorityBuckets = { Critical: [], High: [], Medium: [], Low: [] };

    noItems.forEach(item => {
      const p = priorityFor(item);
      priorityBuckets[p].push(item);
    });

    const topItems = []
      .concat(priorityBuckets.Critical, priorityBuckets.High, priorityBuckets.Medium, priorityBuckets.Low)
      .slice(0, 5)
      .map(item => ({
        text: itemText(item),
        category: categoryOf(item),
        priority: priorityFor(item),
        recommendation: recommendationFor(item)
      }));

    const signals = [];
    if (comp === null) signals.push('Inspection has not yet captured enough Yes/No answers for a reliable AI summary.');
    else if (comp >= 90) signals.push('Overall compliance is strong; focus on closing the remaining high-risk actions.');
    else if (comp >= 75) signals.push('Moderate compliance profile; prioritise weak categories before report finalisation.');
    else signals.push('Elevated risk profile; management attention is recommended before the inspection is closed.');

    if (priorityBuckets.Critical.length) signals.push(priorityBuckets.Critical.length + ' critical item(s) should be escalated immediately.');
    if (weakest.length) signals.push('Weakest category: ' + weakest[0].category + ' (' + weakest[0].score + '%).');
    if (history(project).length >= 2) signals.push('Inspection history is available for trend-based decision support.');
    trendSignal(project).slice(0, 2).forEach(s => signals.push(s));

    const executiveSummary =
      comp === null
        ? 'AI Assist is ready, but the current inspection requires more answered checklist items before a meaningful executive summary can be generated.'
        : `The current inspection for ${project?.name || 'this premises'} indicates ${comp}% compliance with ${noItems.length} open risk item(s). ${priorityBuckets.Critical.length ? 'Critical life-safety or protection items require immediate escalation. ' : ''}${weakest[0] ? 'The weakest current category is ' + weakest[0].category + '. ' : ''}The recommended management focus is to close critical and high-priority actions first, then verify completion with evidence.`;

    return {
      compliance: comp,
      noCount: noItems.length,
      critical: priorityBuckets.Critical.length,
      high: priorityBuckets.High.length,
      medium: priorityBuckets.Medium.length,
      low: priorityBuckets.Low.length,
      weakest,
      topItems,
      signals,
      executiveSummary
    };
  }

  function metric(label, value, helper, tone) {
    return `<div class="s110-metric ${tone || ''}">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
      <small>${esc(helper || '')}</small>
    </div>`;
  }

  function renderTopItems(items) {
    if (!items.length) {
      return '<div class="s110-empty">No open No-items detected in the current inspection.</div>';
    }
    return `<div class="s110-action-list">${items.map(item => `
      <div class="s110-action">
        <div class="s110-action-head">
          <strong>${esc(item.text)}</strong>
          <span class="s110-priority ${esc(item.priority.toLowerCase())}">${esc(item.priority)}</span>
        </div>
        <div class="s110-category">${esc(item.category)}</div>
        <p>${esc(item.recommendation)}</p>
      </div>`).join('')}</div>`;
  }

  function renderWeakCategories(rows) {
    if (!rows.length) return '<div class="s110-empty">Category guidance will appear once checklist answers are captured.</div>';
    return `<div class="s110-category-list">${rows.map(row => `
      <div class="s110-cat-row">
        <div><strong>${esc(row.category)}</strong><small>${row.no} open risk item(s)</small></div>
        <span>${row.score}%</span>
      </div>`).join('')}</div>`;
  }

  function renderSignals(signals) {
    return `<div class="s110-signals">${signals.map(s => `<span>${esc(s)}</span>`).join('')}</div>`;
  }

  function renderPanel(projectId) {
    const existing = document.getElementById('sprint110AiAssistPanel');
    if (existing) existing.remove();

    const project = findProject(projectId || window.currentProjectId || window.currentProject?.id);
    if (!project) return;

    const form = document.getElementById('projectFormSection');
    if (!form) return;

    const ai = buildAssistant(project);
    const panel = document.createElement('div');
    panel.id = 'sprint110AiAssistPanel';
    panel.className = 's110-ai-panel';
    panel.innerHTML = `
      <div class="s110-header">
        <div>
          <h3>AI Assist</h3>
          <p>Offline decision-support summary based on current answers, actions and trends.</p>
        </div>
        <span class="s110-version">Sprint ${VERSION}</span>
      </div>

      <div class="s110-summary-card">
        <h4>Draft Executive Summary</h4>
        <p>${esc(ai.executiveSummary)}</p>
        <button type="button" class="secondary-btn s110-copy-btn" data-s110-copy="summary">Copy Summary</button>
      </div>

      <div class="s110-metrics">
        ${metric('Compliance', ai.compliance === null ? '-' : ai.compliance + '%', 'current inspection', ai.compliance !== null && ai.compliance < 75 ? 'warn' : '')}
        ${metric('Open Risk Items', String(ai.noCount), 'current No answers', ai.noCount ? 'warn' : '')}
        ${metric('Critical', String(ai.critical), 'immediate escalation', ai.critical ? 'critical' : '')}
        ${metric('High Priority', String(ai.high), 'close first', ai.high ? 'warn' : '')}
      </div>

      ${renderSignals(ai.signals)}

      <div class="s110-grid">
        <div class="s110-card">
          <h4>Recommended Next Actions</h4>
          ${renderTopItems(ai.topItems)}
        </div>
        <div class="s110-card">
          <h4>Weakest Categories</h4>
          ${renderWeakCategories(ai.weakest)}
        </div>
      </div>
    `;

    const trend = document.getElementById('sprint1093TrendPanel');
    if (trend) trend.insertAdjacentElement('afterend', panel);
    else {
      const comparison = document.getElementById('sprint1092ComparisonPanel');
      if (comparison) comparison.insertAdjacentElement('afterend', panel);
      else {
        const history = document.getElementById('sprint109HistoryPanel');
        if (history) history.insertAdjacentElement('afterend', panel);
        else form.prepend(panel);
      }
    }

    const copyBtn = panel.querySelector('[data-s110-copy="summary"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(ai.executiveSummary);
          copyBtn.textContent = 'Copied';
          setTimeout(() => { copyBtn.textContent = 'Copy Summary'; }, 1400);
        } catch (err) {
          window.prompt('Copy summary:', ai.executiveSummary);
        }
      });
    }
  }

  function installStyles() {
    if (document.getElementById('sprint110AiAssistStyles')) return;
    const style = document.createElement('style');
    style.id = 'sprint110AiAssistStyles';
    style.textContent = `
      .s110-ai-panel{margin:18px 0;padding:18px;border:1px solid #d7dde8;border-radius:18px;background:#fff;box-shadow:0 10px 24px rgba(15,23,42,.06)}
      .s110-header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}
      .s110-header h3{margin:0;font-size:1.15rem}
      .s110-header p{margin:4px 0 0;color:#64748b}
      .s110-version{font-size:.75rem;border:1px solid #d7dde8;border-radius:999px;padding:4px 8px;color:#475569;white-space:nowrap}
      .s110-summary-card,.s110-card{border:1px solid #e2e8f0;border-radius:14px;padding:14px;background:#f8fafc}
      .s110-summary-card h4,.s110-card h4{margin:0 0 8px}
      .s110-summary-card p{margin:0 0 12px;line-height:1.45;color:#334155}
      .s110-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}
      .s110-metric{border:1px solid #e2e8f0;background:#fff;border-radius:14px;padding:12px}
      .s110-metric span{display:block;font-size:.78rem;color:#64748b}
      .s110-metric strong{display:block;font-size:1.35rem;margin:4px 0;color:#0f172a}
      .s110-metric small{color:#64748b}
      .s110-metric.warn strong{color:#b45309}
      .s110-metric.critical strong{color:#b91c1c}
      .s110-grid{display:grid;grid-template-columns:1.35fr .9fr;gap:12px;margin-top:12px}
      .s110-action-list{display:grid;gap:10px}
      .s110-action{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px}
      .s110-action-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .s110-action-head strong{font-size:.95rem}
      .s110-category{font-size:.78rem;color:#64748b;margin-top:3px}
      .s110-action p{margin:8px 0 0;color:#334155;line-height:1.4}
      .s110-priority{font-size:.72rem;border-radius:999px;padding:3px 7px;background:#e2e8f0;color:#334155;white-space:nowrap}
      .s110-priority.critical{background:#fee2e2;color:#991b1b}
      .s110-priority.high{background:#ffedd5;color:#9a3412}
      .s110-priority.medium{background:#fef9c3;color:#854d0e}
      .s110-priority.low{background:#dcfce7;color:#166534}
      .s110-category-list{display:grid;gap:8px}
      .s110-cat-row{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:10px}
      .s110-cat-row small{display:block;color:#64748b;margin-top:2px}
      .s110-cat-row span{font-weight:700}
      .s110-signals{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
      .s110-signals span{border:1px solid #dbeafe;background:#eff6ff;color:#1e3a8a;border-radius:999px;padding:5px 9px;font-size:.8rem}
      .s110-empty{padding:12px;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;background:#fff}
      @media(max-width:800px){.s110-metrics,.s110-grid{grid-template-columns:1fr}.s110-header{display:block}.s110-version{display:inline-block;margin-top:8px}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    installStyles();

    const originalOpen = window.openProject;
    if (typeof originalOpen === 'function' && !originalOpen.__s110Wrapped) {
      const wrapped = function(projectId, focusMode) {
        const result = originalOpen.apply(this, arguments);
        setTimeout(() => renderPanel(projectId), 760);
        return result;
      };
      wrapped.__s110Wrapped = true;
      window.openProject = wrapped;
    }

    window.FireSAIAssist1100 = {
      version: VERSION,
      buildAssistant,
      render: renderPanel
    };

    console.log('Fire-S Sprint 110.0 installed:', VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(install, 460));
  } else {
    setTimeout(install, 460);
  }
})();