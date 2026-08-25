/* FIRE-S Sprint 111.0 - Analytics Tab
   Moves statistical / management information into a dedicated hidden Analytics workspace.
   The inspection pages stay operational and clean; Analytics is opened only when needed. */
(function () {
  'use strict';

  const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  function safeText(value, fallback = '') {
    return String(value ?? fallback).trim();
  }

  function escapeHtml(value) {
    return safeText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getCurrentProject() {
    try {
      const projects = typeof getProjects === 'function' ? getProjects() : [];
      const id = typeof currentProjectId !== 'undefined' ? currentProjectId : null;
      return projects.find(project => project && project.id === id) || null;
    } catch (error) {
      console.warn('Analytics could not load current project:', error);
      return null;
    }
  }

  function getChecklistForProject(project) {
    try {
      if (typeof getActiveTemplateChecklist === 'function') {
        const active = getActiveTemplateChecklist();
        if (Array.isArray(active) && active.length) return active;
      }
    } catch (_) {}

    if (Array.isArray(window.checklistData) && window.checklistData.length) {
      return window.checklistData;
    }

    if (Array.isArray(window.checklists) && window.checklists.length) {
      return window.checklists;
    }

    return [];
  }

  function inferCategory(text) {
    const q = safeText(text).toLowerCase();

    if (/escape|exit|egress|route|stair|corridor|walkway|assembly/.test(q)) return 'Means of Escape';
    if (/detect|alarm|mcp|manual call|sounder|beacon|panel|detector/.test(q)) return 'Fire Detection & Alarm';
    if (/extinguisher|hose reel|fire blanket|fire equipment|service tag/.test(q)) return 'Fire Equipment';
    if (/emergency light|lighting|luminaire|battery backup/.test(q)) return 'Emergency Lighting';
    if (/hydrant|sprinkler|pump|tank|water|booster|valve/.test(q)) return 'Fire Water Supply';
    if (/door|self[- ]closing|fire door|smoke seal/.test(q)) return 'Fire Doors';
    if (/electrical|db|distribution board|cable|plug|generator|ups/.test(q)) return 'Electrical';
    if (/housekeeping|storage|combustible|waste|flammable|clean/.test(q)) return 'Housekeeping';
    if (/document|certificate|coc|logbook|record|register|drill|training|plan/.test(q)) return 'Documentation';
    if (/smoke|ventilation|pressuri[sz]ation|extract/.test(q)) return 'Smoke Control';

    return 'General Fire Safety';
  }

  function inferPriority(category, question) {
    const c = safeText(category).toLowerCase();
    const q = safeText(question).toLowerCase();

    if (/blocked|obstruct|locked|fail|not working|isolated|missing|damaged/.test(q)) {
      if (/escape|exit|egress|stair|alarm|detect|sprinkler|pump|hydrant|water|door/.test(c + ' ' + q)) {
        return 'Critical';
      }
      return 'High';
    }

    if (/escape|detection|alarm|sprinkler|pump|hydrant|fire water|emergency lighting|fire door/.test(c)) return 'High';
    if (/fire equipment|electrical|housekeeping/.test(c)) return 'Medium';
    return 'Low';
  }

  function getQuestionForAnswer(answer, checklist) {
    const index = Number(answer?.itemIndex);
    const byIndex = Number.isFinite(index) ? checklist[index] : null;
    const byItemNumber = checklist.find(item => String(item?.['Item Number']) === String(answer?.itemNumber));
    const item = byIndex || byItemNumber || {};
    return {
      text: safeText(
        answer?.question ||
        item['Checklist Item'] ||
        item.question ||
        item.text ||
        `Inspection item ${safeText(answer?.itemNumber || index + 1, '')}`
      ),
      category: safeText(
        answer?.category ||
        item.Category ||
        item.category ||
        item.Section ||
        item.section ||
        '',
      )
    };
  }

  function getAnswers(project) {
    return Array.isArray(project?.answers) ? project.answers : [];
  }

  function buildActionItems(project) {
    const checklist = getChecklistForProject(project);
    return getAnswers(project)
      .filter(answer => safeText(answer?.answer).toLowerCase() === 'no')
      .map((answer, index) => {
        const q = getQuestionForAnswer(answer, checklist);
        const category = q.category || inferCategory(q.text);
        const priority = answer.priority || inferPriority(category, q.text);
        return {
          id: answer.id || `${project?.id || 'project'}-${answer.itemIndex ?? index}`,
          question: q.text,
          description: safeText(answer.note) || 'Corrective action required for this non-compliant inspection item.',
          category,
          priority,
          itemNumber: safeText(answer.itemNumber || (answer.itemIndex ?? index) + 1)
        };
      });
  }

  function calculateCompliance(project) {
    const answers = getAnswers(project).filter(a => ['yes', 'no', 'n/a'].includes(safeText(a?.answer).toLowerCase()));
    const applicable = answers.filter(a => safeText(a?.answer).toLowerCase() !== 'n/a');
    if (!applicable.length) return 0;
    const yes = applicable.filter(a => safeText(a?.answer).toLowerCase() === 'yes').length;
    return Math.round((yes / applicable.length) * 100);
  }

  function getHealth(score) {
    if (score >= 96) return 'Excellent';
    if (score >= 90) return 'Very Good';
    if (score >= 80) return 'Good';
    if (score >= 70) return 'Needs Attention';
    if (score >= 60) return 'Poor';
    return score > 0 ? 'Critical' : 'Incomplete';
  }

  function getOverallRisk(actions, compliance) {
    if (actions.some(a => a.priority === 'Critical')) return 'High';
    if (actions.some(a => a.priority === 'High') || compliance < 70) return 'Medium';
    if (!compliance) return 'Unknown';
    return 'Low';
  }

  function groupByCategory(actions) {
    const map = new Map();
    actions.forEach(action => {
      const key = action.category || 'General Fire Safety';
      if (!map.has(key)) map.set(key, { category: key, open: 0, critical: 0, high: 0, medium: 0, low: 0, actions: [] });
      const group = map.get(key);
      group.open += 1;
      group.actions.push(action);
      const p = safeText(action.priority).toLowerCase();
      if (p === 'critical') group.critical += 1;
      else if (p === 'high') group.high += 1;
      else if (p === 'medium') group.medium += 1;
      else group.low += 1;
    });

    return Array.from(map.values()).sort((a, b) => {
      const riskA = a.critical * 100 + a.high * 25 + a.medium * 5 + a.open;
      const riskB = b.critical * 100 + b.high * 25 + b.medium * 5 + b.open;
      return riskB - riskA;
    });
  }

  function calculateCategoryPerformance(project) {
    const checklist = getChecklistForProject(project);
    const groups = new Map();

    getAnswers(project).forEach(answer => {
      const value = safeText(answer?.answer).toLowerCase();
      if (!['yes', 'no'].includes(value)) return;

      const q = getQuestionForAnswer(answer, checklist);
      const category = q.category || inferCategory(q.text);
      if (!groups.has(category)) groups.set(category, { category, total: 0, yes: 0 });
      const group = groups.get(category);
      group.total += 1;
      if (value === 'yes') group.yes += 1;
    });

    return Array.from(groups.values())
      .map(group => ({ ...group, score: group.total ? Math.round((group.yes / group.total) * 100) : 0 }))
      .sort((a, b) => a.score - b.score);
  }

  function getTrendData(project) {
    const inspections = Array.isArray(project?.inspections) ? project.inspections : [];
    const completed = inspections
      .filter(item => item && (item.compliance || item.answers))
      .slice(-5);

    if (completed.length < 2) return null;

    const first = Number(completed[0].compliance || 0);
    const last = Number(completed[completed.length - 1].compliance || 0);
    return {
      count: completed.length,
      delta: last - first,
      direction: last >= first ? 'Improving' : 'Declining'
    };
  }

  function renderAnalytics() {
    const container = document.getElementById('analyticsContent');
    if (!container) return;

    const project = getCurrentProject();
    if (!project) {
      container.innerHTML = '<div class="analytics-empty">Open an inspection first to view Analytics.</div>';
      return;
    }

    const actions = buildActionItems(project);
    const compliance = calculateCompliance(project);
    const health = getHealth(compliance);
    const risk = getOverallRisk(actions, compliance);
    const categories = groupByCategory(actions);
    const categoryPerformance = calculateCategoryPerformance(project);
    const trend = getTrendData(project);

    const counts = actions.reduce((acc, action) => {
      const key = action.priority || 'Low';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { Critical: 0, High: 0, Medium: 0, Low: 0 });

    const topActions = actions
      .slice()
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
      .slice(0, 5);

    const weakest = categoryPerformance.slice(0, 6);
    const mainRiskCategory = categories[0]?.category || weakest[0]?.category || 'No major risk category identified';

    container.innerHTML = `
      <div class="analytics-tiles">
        <div class="analytics-tile"><span>Compliance</span><strong>${compliance || 0}%</strong></div>
        <div class="analytics-tile"><span>Building Health</span><strong>${escapeHtml(health)}</strong></div>
        <div class="analytics-tile"><span>Overall Risk</span><strong>${escapeHtml(risk)}</strong></div>
        <div class="analytics-tile"><span>Open Actions</span><strong>${actions.length}</strong></div>
      </div>

      <div class="analytics-grid-two">
        <section class="analytics-panel">
          <h3>Action Summary</h3>
          <div class="analytics-action-counts">
            <div><span>Critical</span><strong>${counts.Critical || 0}</strong></div>
            <div><span>High</span><strong>${counts.High || 0}</strong></div>
            <div><span>Medium</span><strong>${counts.Medium || 0}</strong></div>
            <div><span>Low</span><strong>${counts.Low || 0}</strong></div>
          </div>
        </section>

        <section class="analytics-panel">
          <h3>Trend</h3>
          <div class="analytics-trend-big">${trend ? `${trend.delta >= 0 ? '▲' : '▼'} ${Math.abs(trend.delta)}%` : 'Not enough history'}</div>
          <p>${trend ? `Compliance trend is ${escapeHtml(trend.direction.toLowerCase())} across the last ${trend.count} inspections.` : 'Complete at least two inspections for this premises to show trend analytics.'}</p>
        </section>
      </div>

      <section class="analytics-panel">
        <h3>Category Performance</h3>
        ${weakest.length ? weakest.map(item => `
          <div class="analytics-category-row">
            <div><strong>${escapeHtml(item.category)}</strong><span>${item.yes}/${item.total} compliant</span></div>
            <div class="analytics-bar"><i style="width:${Math.max(0, Math.min(100, item.score))}%"></i></div>
            <strong>${item.score}%</strong>
          </div>
        `).join('') : '<p>No category performance data available yet.</p>'}
      </section>

      <section class="analytics-panel">
        <h3>Priority Action Categories</h3>
        ${categories.length ? categories.slice(0, 6).map(group => `
          <div class="analytics-risk-category">
            <div>
              <strong>${escapeHtml(group.category)}</strong>
              <span>${group.open} open action${group.open === 1 ? '' : 's'}${group.critical ? ` • ${group.critical} critical` : ''}${group.high ? ` • ${group.high} high` : ''}</span>
            </div>
            <button type="button" data-analytics-action-category="${escapeHtml(group.category)}">View</button>
          </div>
        `).join('') : '<p>No open action categories. Good result.</p>'}
      </section>

      <section class="analytics-panel">
        <h3>Top 5 Priority Action Items</h3>
        ${topActions.length ? topActions.map(action => `
          <div class="analytics-action-item">
            <div class="analytics-priority ${escapeHtml(action.priority.toLowerCase())}">${escapeHtml(action.priority)}</div>
            <div>
              <strong>${escapeHtml(action.question)}</strong>
              <span>${escapeHtml(action.category)} • Item ${escapeHtml(action.itemNumber)}</span>
              <p>${escapeHtml(action.description)}</p>
            </div>
          </div>
        `).join('') : '<p>No priority action items found.</p>'}
      </section>

      <section class="analytics-panel analytics-ai-summary">
        <h3>AI-ready Summary</h3>
        <p>${actions.length} open action${actions.length === 1 ? '' : 's'} identified. ${counts.Critical || 0} critical and ${counts.High || 0} high priority item${(counts.High || 0) === 1 ? '' : 's'} require management attention.</p>
        <p>${escapeHtml(mainRiskCategory)} is currently the highest attention area.</p>
        <p>${trend ? `Compliance is ${trend.direction.toLowerCase()} by ${Math.abs(trend.delta)}% across recent inspection history.` : 'Trend analytics will activate when inspection history is available.'}</p>
      </section>
    `;

    container.querySelectorAll('[data-analytics-action-category]').forEach(button => {
      button.addEventListener('click', () => {
        const actionSection = document.getElementById('actionRegisterCard') || document.getElementById('checklistCard');
        if (actionSection) actionSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function showAnalytics() {
    const section = document.getElementById('analyticsSection');
    if (!section) return;
    section.style.display = 'block';
    renderAnalytics();
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function hideAnalytics() {
    const section = document.getElementById('analyticsSection');
    if (section) section.style.display = 'none';
  }

  function bindAnalyticsControls() {
    const ids = ['analyticsBtn', 'analyticsMenuBtn', 'refreshAnalyticsBtn'];
    ids.forEach(id => {
      const button = document.getElementById(id);
      if (!button || button.dataset.analyticsBound === 'true') return;
      button.dataset.analyticsBound = 'true';
      button.addEventListener('click', showAnalytics);
    });

    const closeBtn = document.getElementById('closeAnalyticsBtn');
    if (closeBtn && closeBtn.dataset.analyticsBound !== 'true') {
      closeBtn.dataset.analyticsBound = 'true';
      closeBtn.addEventListener('click', hideAnalytics);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindAnalyticsControls();
    setTimeout(bindAnalyticsControls, 500);
  });

  window.fireSRenderAnalytics = renderAnalytics;
  window.fireSShowAnalytics = showAnalytics;
})();
