/* Fire-S Sprint 110.1 - Dashboard Data Consolidation
   Purpose: remove duplicate/generic AI cards and make the Executive Dashboard read from the Action Register as the source of truth. */
(function () {
  'use strict';

  const VERSION = '110.1-dashboard-data-consolidation';
  const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  function esc(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value || '');
    return String(value || '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function readProjects() {
    try {
      if (typeof getProjects === 'function') return getProjects();
      return JSON.parse(localStorage.getItem('fireyeProjects') || '[]');
    } catch (err) {
      console.warn('Sprint 110.1 could not read projects', err);
      return [];
    }
  }

  function findProject(projectId) {
    const id = projectId || window.currentProjectId || window.currentProject?.id;
    return readProjects().find(project => String(project.id) === String(id)) || window.currentProject || null;
  }

  function normalise(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function isOpen(action) {
    return String(action?.status || 'Open').trim().toLowerCase() !== 'closed';
  }

  function priorityOf(action) {
    const p = String(action?.priority || action?.severity || 'Medium').trim();
    if (/critical/i.test(p)) return 'Critical';
    if (/high/i.test(p)) return 'High';
    if (/low/i.test(p)) return 'Low';
    return 'Medium';
  }

  function inferCategory(text) {
    const t = normalise(text);
    if (/escape|egress|exit|stair|corridor|route|evac/.test(t)) return 'Means of Escape';
    if (/fire door|door closer|self closing|smoke seal/.test(t)) return 'Fire Doors';
    if (/alarm|detect|detector|mcp|manual call point|sounder|panel/.test(t)) return 'Fire Detection and Alarm';
    if (/sprinkler|suppression|pump|valve|hydrant|hose reel|booster|water/.test(t)) return 'Fire Water / Protection';
    if (/extinguisher|fire equipment|servic/.test(t)) return 'Fire Equipment';
    if (/emergency light|lighting|exit sign|signage/.test(t)) return 'Emergency Lighting / Signage';
    if (/electric|db|distribution board|cable|generator/.test(t)) return 'Electrical';
    if (/housekeeping|storage|combustible|waste/.test(t)) return 'Housekeeping';
    if (/document|certificate|coc|logbook|record|plan|drill/.test(t)) return 'Documentation';
    return 'Uncategorised';
  }

  function categoryOf(item) {
    const direct = item?.sectionName || item?.category || item?.section || item?.group || item?.discipline;
    if (direct && !/^general$/i.test(String(direct).trim())) return String(direct).trim();
    return inferCategory([item?.question, item?.finding, item?.correctiveAction, item?.title, item?.text].filter(Boolean).join(' '));
  }

  function cleanTitle(action) {
    const candidates = [
      action?.question,
      action?.finding,
      action?.title,
      action?.item,
      action?.description,
      action?.actionId
    ].map(v => String(v || '').trim()).filter(Boolean);

    let title = candidates.find(v => !/^inspection item$/i.test(v) && !/^checklist item\s*\d*$/i.test(v));
    if (!title) title = categoryOf(action) + ' Action';

    title = title.replace(/^are\s+/i, '').replace(/\?+$/g, '').trim();
    if (title.length > 92) title = title.slice(0, 89).trim() + '...';
    return title || 'Action Item';
  }

  function recommendedText(action) {
    const direct = String(action?.correctiveAction || action?.recommendation || '').trim();
    if (direct && !/^assign the item to a responsible person/i.test(direct)) return direct;

    const haystack = normalise([action?.question, action?.finding, categoryOf(action)].join(' '));
    if (/exit|escape|egress|route|stair|corridor/.test(haystack)) return 'Remove the obstruction or defect immediately and verify that the full escape route remains available for safe evacuation.';
    if (/fire door|door/.test(haystack)) return 'Repair or reinstate the fire door, including self-closing and latching operation. Remove wedges or unapproved hold-open devices.';
    if (/alarm|detect|detector|mcp|call point|sounder|panel/.test(haystack)) return 'Arrange inspection and testing by a competent fire detection contractor and record the fault, repair and retest evidence.';
    if (/sprinkler|pump|hydrant|hose reel|water|valve|booster/.test(haystack)) return 'Arrange urgent inspection by a competent fire protection contractor and confirm that the water supply and equipment are serviceable.';
    if (/extinguisher/.test(haystack)) return 'Service, replace or correctly position the extinguisher and update the service tag and maintenance record.';
    if (/emergency light|lighting|signage|exit sign/.test(haystack)) return 'Repair or replace the defective emergency lighting/signage and verify operation under test conditions.';
    if (/electric|db|distribution board|generator|cable/.test(haystack)) return 'Refer to a competent electrical contractor and keep combustible materials and obstructions clear of electrical equipment.';
    if (/housekeeping|storage|combustible|waste/.test(haystack)) return 'Remove unnecessary combustible material and maintain clear access to escape routes and fire protection equipment.';
    if (/document|certificate|coc|logbook|record|plan|drill/.test(haystack)) return 'Obtain, update and file the required records or certificates so that current evidence is available for audit.';
    return 'Assign responsibility, set a target date, close out with evidence, and verify completion during the next inspection.';
  }

  function uniqueOpenActions(project) {
    const raw = Array.isArray(project?.actions) ? project.actions.filter(isOpen) : [];
    const seen = new Set();
    const output = [];

    raw.forEach(action => {
      const category = categoryOf(action);
      const title = cleanTitle(action);
      const key = action?.actionKey || [category, title, action?.finding || '', action?.itemIndex ?? ''].map(normalise).join('|');
      if (seen.has(key)) return;
      seen.add(key);
      output.push({
        ...action,
        _title: title,
        _category: category,
        _priority: priorityOf(action),
        _recommendation: recommendedText(action)
      });
    });

    return output.sort((a, b) =>
      (PRIORITY_ORDER[a._priority] ?? 2) - (PRIORITY_ORDER[b._priority] ?? 2) ||
      String(a.dueDate || '').localeCompare(String(b.dueDate || '')) ||
      a._title.localeCompare(b._title)
    );
  }

  function answerValue(answer) {
    return normalise(answer?.answer || answer?.value || '');
  }

  function answerQuestion(answer) {
    return answer?.question || answer?.text || answer?.label || answer?.title || answer?.item || answer?.requirement || '';
  }

  function activeAnswers(project) {
    return Array.isArray(project?.answers) ? project.answers : [];
  }

  function answerCategory(answer) {
    return categoryOf({
      sectionName: answer?.sectionName,
      category: answer?.category,
      section: answer?.section,
      question: answerQuestion(answer),
      finding: answer?.note
    });
  }

  function compliance(project) {
    const yesNo = activeAnswers(project).filter(answer => ['yes', 'no'].includes(answerValue(answer)));
    if (!yesNo.length) return null;
    const yes = yesNo.filter(answer => answerValue(answer) === 'yes').length;
    return Math.round((yes / yesNo.length) * 100);
  }

  function priorityStats(actions) {
    return actions.reduce((acc, action) => {
      acc[action._priority] = (acc[action._priority] || 0) + 1;
      return acc;
    }, { Critical: 0, High: 0, Medium: 0, Low: 0 });
  }

  function categoryRows(project, actions) {
    const map = new Map();

    activeAnswers(project).forEach(answer => {
      const ans = answerValue(answer);
      if (!['yes', 'no'].includes(ans)) return;
      const cat = answerCategory(answer);
      if (!map.has(cat)) map.set(cat, { category: cat, yes: 0, no: 0, total: 0, actions: 0, critical: 0, high: 0 });
      const row = map.get(cat);
      row.total += 1;
      if (ans === 'yes') row.yes += 1;
      if (ans === 'no') row.no += 1;
    });

    actions.forEach(action => {
      const cat = action._category;
      if (!map.has(cat)) map.set(cat, { category: cat, yes: 0, no: 0, total: 0, actions: 0, critical: 0, high: 0 });
      const row = map.get(cat);
      row.actions += 1;
      if (action._priority === 'Critical') row.critical += 1;
      if (action._priority === 'High') row.high += 1;
    });

    return Array.from(map.values())
      .filter(row => row.actions > 0 || row.no > 0)
      .map(row => {
        const score = row.total ? Math.round((row.yes / row.total) * 100) : Math.max(0, 100 - (row.actions * 12) - (row.critical * 18) - (row.high * 10));
        return { ...row, score };
      })
      .sort((a, b) => a.score - b.score || b.critical - a.critical || b.actions - a.actions)
      .slice(0, 5);
  }

  function fallbackNoActions(project) {
    return activeAnswers(project)
      .filter(answer => answerValue(answer) === 'no')
      .map((answer, index) => {
        const pseudo = {
          question: answerQuestion(answer) || `Checklist item ${index + 1}`,
          finding: answer?.note || '',
          sectionName: answerCategory(answer),
          priority: answer?.severity || answer?.priority || 'Medium',
          status: 'Open'
        };
        return {
          ...pseudo,
          _title: cleanTitle(pseudo),
          _category: categoryOf(pseudo),
          _priority: priorityOf(pseudo),
          _recommendation: recommendedText(pseudo)
        };
      });
  }

  function buildDashboard(project) {
    let actions = uniqueOpenActions(project);
    const usingRegister = actions.length > 0;
    if (!actions.length) actions = fallbackNoActions(project).slice(0, 5);

    const stats = priorityStats(actions);
    const comp = compliance(project);
    const rows = categoryRows(project, actions);
    const topActions = actions.slice(0, 5);

    const highestRiskCategory = rows[0]?.category || (topActions[0]?._category || 'Not available');
    const actionLabel = usingRegister ? 'open Action Register item(s)' : 'open No-answer item(s)';

    const summary = comp === null && !topActions.length
      ? 'No current action data is available yet. Complete checklist items and allow the Action Register to create actions before using the Executive Dashboard.'
      : `${project?.name || 'This premises'} currently has ${topActions.length ? actions.length : 0} ${actionLabel}. ${comp === null ? 'Compliance cannot yet be calculated from the current answers.' : `Current compliance is ${comp}%.`} ${stats.Critical ? `${stats.Critical} critical item(s) require immediate escalation. ` : ''}${highestRiskCategory !== 'Not available' ? `Highest management focus area: ${highestRiskCategory}. ` : ''}The dashboard is now generated from the Action Register rather than duplicate placeholder items.`;

    const signals = [];
    signals.push(usingRegister ? 'Action Register is the dashboard source of truth.' : 'No Action Register items found; using current NO answers as fallback.');
    if (stats.Critical) signals.push(`${stats.Critical} critical action(s) require immediate management attention.`);
    if (stats.High) signals.push(`${stats.High} high-priority action(s) should be closed before report finalisation.`);
    if (rows[0]) signals.push(`Weakest category: ${rows[0].category} (${rows[0].score}%).`);
    if (!actions.length) signals.push('No open actions detected.');

    return { comp, actions, topActions, stats, rows, summary, signals, usingRegister };
  }

  function metric(label, value, helper, tone) {
    return `<div class="s110-metric ${tone || ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(helper || '')}</small></div>`;
  }

  function renderActions(actions) {
    if (!actions.length) return '<div class="s110-empty">No priority action items are currently available.</div>';
    return `<div class="s110-action-list">${actions.map(action => `
      <div class="s110-action priority-${esc(action._priority.toLowerCase())}">
        <div class="s110-action-head">
          <strong>${esc(action._title)}</strong>
          <span class="s110-priority ${esc(action._priority.toLowerCase())}">${esc(action._priority)}</span>
        </div>
        <div class="s110-category">${esc(action._category)}${action.actionId ? ' · ' + esc(action.actionId) : ''}</div>
        <p>${esc(action._recommendation)}</p>
      </div>`).join('')}</div>`;
  }

  function renderCategories(rows) {
    if (!rows.length) return '<div class="s110-empty">Weak categories will appear once Action Register data is available.</div>';
    return `<div class="s110-category-list">${rows.map(row => `
      <div class="s110-cat-row">
        <div><strong>${esc(row.category)}</strong><small>${row.actions} open action(s)${row.critical ? ' · ' + row.critical + ' critical' : ''}</small></div>
        <span>${row.score}%</span>
      </div>`).join('')}</div>`;
  }

  function renderSignals(signals) {
    return `<div class="s110-signals">${signals.map(signal => `<span>${esc(signal)}</span>`).join('')}</div>`;
  }

  function render(projectId) {
    const project = findProject(projectId);
    if (!project) return;

    const oldPanel = document.getElementById('sprint110AiAssistPanel');
    if (oldPanel) oldPanel.remove();

    const form = document.getElementById('projectFormSection');
    if (!form) return;

    const data = buildDashboard(project);
    const panel = document.createElement('div');
    panel.id = 'sprint110AiAssistPanel';
    panel.className = 's110-ai-panel s110-1-consolidated';
    panel.innerHTML = `
      <div class="s110-header">
        <div>
          <h3>Executive Intelligence</h3>
          <p>Data-driven summary generated from the Action Register and current inspection answers.</p>
        </div>
        <span class="s110-version">Sprint ${VERSION}</span>
      </div>

      <div class="s110-summary-card">
        <h4>Executive Summary</h4>
        <p>${esc(data.summary)}</p>
        <button type="button" class="secondary-btn s110-copy-btn" data-s110-copy="summary">Copy Summary</button>
      </div>

      <div class="s110-metrics">
        ${metric('Compliance', data.comp === null ? '-' : data.comp + '%', 'current inspection', data.comp !== null && data.comp < 75 ? 'warn' : '')}
        ${metric('Open Actions', String(data.actions.length), data.usingRegister ? 'from Action Register' : 'from NO answers', data.actions.length ? 'warn' : '')}
        ${metric('Critical', String(data.stats.Critical || 0), 'immediate escalation', data.stats.Critical ? 'critical' : '')}
        ${metric('High Priority', String(data.stats.High || 0), 'close first', data.stats.High ? 'warn' : '')}
      </div>

      ${renderSignals(data.signals)}

      <div class="s110-grid">
        <div class="s110-card">
          <h4>Priority Action Items</h4>
          ${renderActions(data.topActions)}
        </div>
        <div class="s110-card">
          <h4>Weakest Categories</h4>
          ${renderCategories(data.rows)}
        </div>
      </div>`;

    const trend = document.getElementById('sprint1093TrendPanel');
    const comparison = document.getElementById('sprint1092ComparisonPanel');
    const history = document.getElementById('sprint109HistoryPanel');
    if (trend) trend.insertAdjacentElement('afterend', panel);
    else if (comparison) comparison.insertAdjacentElement('afterend', panel);
    else if (history) history.insertAdjacentElement('afterend', panel);
    else form.prepend(panel);

    const copyBtn = panel.querySelector('[data-s110-copy="summary"]');
    copyBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(data.summary);
        copyBtn.textContent = 'Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy Summary'; }, 1400);
      } catch (err) {
        window.prompt('Copy summary:', data.summary);
      }
    });
  }

  function installStyles() {
    if (document.getElementById('sprint1101ConsolidationStyles')) return;
    const style = document.createElement('style');
    style.id = 'sprint1101ConsolidationStyles';
    style.textContent = `
      .s110-1-consolidated .s110-action.priority-critical{border-left:5px solid #dc2626}
      .s110-1-consolidated .s110-action.priority-high{border-left:5px solid #f97316}
      .s110-1-consolidated .s110-action.priority-medium{border-left:5px solid #eab308}
      .s110-1-consolidated .s110-action.priority-low{border-left:5px solid #22c55e}
      .s110-1-consolidated .s110-action-head strong{line-height:1.25}
      .s110-1-consolidated .s110-category{font-weight:600;color:#475569}
      .s110-1-consolidated .s110-summary-card{background:#fff}
    `;
    document.head.appendChild(style);
  }

  function install() {
    installStyles();

    const previousOpen = window.openProject;
    if (typeof previousOpen === 'function' && !previousOpen.__s1101Wrapped) {
      const wrapped = function(projectId, focusMode) {
        const result = previousOpen.apply(this, arguments);
        setTimeout(() => render(projectId), 900);
        setTimeout(() => render(projectId), 1800);
        return result;
      };
      wrapped.__s1101Wrapped = true;
      window.openProject = wrapped;
    }

    const previousActionRender = window.FireSActionRegister?.render;
    if (typeof previousActionRender === 'function' && !previousActionRender.__s1101Wrapped) {
      const wrappedActionRender = function() {
        const result = previousActionRender.apply(this, arguments);
        setTimeout(() => render(), 250);
        return result;
      };
      wrappedActionRender.__s1101Wrapped = true;
      window.FireSActionRegister.render = wrappedActionRender;
    }

    window.FireSExecutiveIntelligence1101 = {
      version: VERSION,
      buildDashboard,
      render,
      uniqueOpenActions
    };

    setTimeout(() => render(), 1200);
    console.log('Fire-S Sprint 110.1 installed:', VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(install, 520));
  } else {
    setTimeout(install, 520);
  }
})();
