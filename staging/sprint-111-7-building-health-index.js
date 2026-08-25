/* Fire-S RC 1.1.7 - Building Health Index
   Safe UI add-on: adds a compact building health score to premises cards without changing inspection data.
*/
(function () {
  'use strict';

  const VERSION = '111.7-building-health-index';

  function norm(value) {
    return String(value || '').trim().toLowerCase();
  }

  function esc(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value || '');
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function answers(project) {
    return Array.isArray(project?.answers) ? project.answers : [];
  }

  function actions(project) {
    return Array.isArray(project?.actions) ? project.actions : [];
  }

  function openActions(project) {
    return actions(project).filter(action => norm(action?.status) !== 'closed');
  }

  function priority(action) {
    const value = norm(action?.priority || action?.severity);
    if (value.includes('critical')) return 'critical';
    if (value.includes('high')) return 'high';
    if (value.includes('low')) return 'low';
    return 'medium';
  }

  function isOverdue(project) {
    const date = String(project?.followUpDate || project?.scheduledDate || '').slice(0, 10);
    if (!date) return false;
    return date < new Date().toISOString().slice(0, 10);
  }

  function complianceScore(project) {
    const applicable = answers(project).filter(answer => {
      const value = norm(answer?.answer);
      return value === 'yes' || value === 'no';
    });

    if (!applicable.length) return null;

    const yes = applicable.filter(answer => norm(answer?.answer) === 'yes').length;
    return Math.round((yes / applicable.length) * 100);
  }

  function calculateHealth(project) {
    const comp = complianceScore(project);
    const open = openActions(project);
    const noAnswers = answers(project).filter(answer => norm(answer?.answer) === 'no').length;
    const critical = open.filter(action => priority(action) === 'critical').length;
    const high = open.filter(action => priority(action) === 'high').length;
    const overdue = isOverdue(project) ? 1 : 0;
    const missingCore = [project?.projectAddress || project?.addressLine, project?.contactPerson, project?.contactTel]
      .filter(Boolean).length < 2 ? 1 : 0;

    let score = comp === null ? 72 : comp;
    score -= Math.min(noAnswers * 3, 24);
    score -= Math.min(open.length * 2, 18);
    score -= critical * 10;
    score -= high * 5;
    score -= overdue * 10;
    score -= missingCore * 5;

    score = Math.max(0, Math.min(100, Math.round(score)));

    let label = 'Healthy';
    let className = 'health-good';

    if (score < 55) {
      label = 'Critical';
      className = 'health-critical';
    } else if (score < 75) {
      label = 'At Risk';
      className = 'health-risk';
    } else if (score < 90) {
      label = 'Attention';
      className = 'health-attention';
    }

    return {
      score,
      label,
      className,
      comp,
      open: open.length,
      critical,
      high,
      noAnswers
    };
  }

  function renderBadge(project) {
    const health = calculateHealth(project);
    return `
      <div class="fire-s-health-index-mini ${esc(health.className)}" title="Building Health Index">
        <div class="fire-s-health-ring" aria-label="Building health ${health.score}%">
          <span>${health.score}</span>
        </div>
        <div class="fire-s-health-copy">
          <strong>${esc(health.label)}</strong>
          <small>Building Health</small>
        </div>
      </div>
    `;
  }

  function decorateProjectCards() {
    const projects = Array.isArray(window.currentProjectsListView)
      ? window.currentProjectsListView
      : [];

    const cards = Array.from(document.querySelectorAll('.inspection-project-list-item'));
    if (!cards.length || !projects.length) return;

    cards.forEach((card, index) => {
      const project = projects[index];
      if (!project) return;

      let slot = card.querySelector('.fire-s-health-index-slot');
      if (!slot) {
        slot = document.createElement('div');
        slot.className = 'fire-s-health-index-slot';
        const title = card.querySelector('.inspection-project-list-title');
        if (title && title.nextSibling) {
          title.insertAdjacentElement('afterend', slot);
        } else {
          card.insertBefore(slot, card.firstChild);
        }
      }

      slot.innerHTML = renderBadge(project);
    });
  }

  function installStyles() {
    if (document.getElementById('sprint1117BuildingHealthStyles')) return;

    const style = document.createElement('style');
    style.id = 'sprint1117BuildingHealthStyles';
    style.textContent = `
      .fire-s-health-index-slot {
        margin: 8px 0 6px;
      }

      .fire-s-health-index-mini {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        max-width: 100%;
        padding: 7px 10px 7px 7px;
        border-radius: 999px;
        border: 1px solid #dbe3ef;
        background: #f8fafc;
        color: #0f172a;
      }

      .fire-s-health-ring {
        width: 38px;
        height: 38px;
        flex: 0 0 38px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: #e2e8f0;
        box-shadow: inset 0 0 0 4px rgba(255,255,255,.72);
      }

      .fire-s-health-ring span {
        font-size: 13px;
        font-weight: 950;
      }

      .fire-s-health-copy {
        display: grid;
        min-width: 0;
        line-height: 1.05;
      }

      .fire-s-health-copy strong {
        font-size: 12px;
        font-weight: 950;
        white-space: nowrap;
      }

      .fire-s-health-copy small {
        margin-top: 2px;
        color: #64748b;
        font-size: 10px;
        font-weight: 850;
        text-transform: uppercase;
        letter-spacing: .04em;
        white-space: nowrap;
      }

      .fire-s-health-index-mini.health-good {
        border-color: #bbf7d0;
        background: #f0fdf4;
      }
      .fire-s-health-index-mini.health-good .fire-s-health-ring {
        background: #22c55e;
        color: #fff;
      }

      .fire-s-health-index-mini.health-attention {
        border-color: #fde68a;
        background: #fffbeb;
      }
      .fire-s-health-index-mini.health-attention .fire-s-health-ring {
        background: #f59e0b;
        color: #fff;
      }

      .fire-s-health-index-mini.health-risk {
        border-color: #fed7aa;
        background: #fff7ed;
      }
      .fire-s-health-index-mini.health-risk .fire-s-health-ring {
        background: #ea580c;
        color: #fff;
      }

      .fire-s-health-index-mini.health-critical {
        border-color: #fecaca;
        background: #fef2f2;
      }
      .fire-s-health-index-mini.health-critical .fire-s-health-ring {
        background: #b91c1c;
        color: #fff;
      }

      @media (max-width: 700px) {
        .fire-s-health-index-slot {
          margin: 6px 0 4px;
        }

        .fire-s-health-index-mini {
          padding: 6px 9px 6px 6px;
          gap: 8px;
        }

        .fire-s-health-ring {
          width: 34px;
          height: 34px;
          flex-basis: 34px;
        }

        .fire-s-health-ring span {
          font-size: 12px;
        }

        .fire-s-health-copy strong {
          font-size: 11px;
        }

        .fire-s-health-copy small {
          font-size: 9px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function patchRenderProjectsList() {
    if (window.__fireS1117RenderPatch) return;
    if (typeof window.renderProjectsList !== 'function') return;

    const original = window.renderProjectsList;
    window.renderProjectsList = function patchedRenderProjectsList() {
      const result = original.apply(this, arguments);
      setTimeout(decorateProjectCards, 0);
      return result;
    };

    window.__fireS1117RenderPatch = true;
  }

  function boot() {
    installStyles();
    patchRenderProjectsList();
    setTimeout(decorateProjectCards, 200);
    setTimeout(decorateProjectCards, 900);
  }

  window.FireSBuildingHealthIndex = {
    VERSION,
    calculateHealth,
    decorateProjectCards
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
