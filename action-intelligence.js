/* =====================================================
   FIRE-S Sprint 108.3
   Action Intelligence v1.0
   Safe add-on module: automatic priority + recommended actions.
   ===================================================== */
(function () {
  'use strict';

  const DEFAULT_ACTION = 'Review the non-compliant item, confirm the site condition, and arrange corrective action with the responsible person. Record completion evidence once resolved.';

  const RULES = [
    {
      match: /exit|escape|egress|route|stair/i,
      priority: 'Critical',
      category: 'Means of Escape',
      recommendation: 'Immediately remove obstructions and restore the designated escape route. Confirm that the route remains available, clearly indicated, and usable at all times.'
    },
    {
      match: /sprinkler|pump|tank|fire water|water supply|hydrant/i,
      priority: 'Critical',
      category: 'Fire Water Supply',
      recommendation: 'Arrange urgent inspection by a competent fire protection contractor. Restore the fire water or sprinkler system to service and retain proof of testing or serviceability.'
    },
    {
      match: /alarm|detection|detector|manual call point|mcp/i,
      priority: 'High',
      category: 'Fire Detection',
      recommendation: 'Arrange testing and repair of the fire detection or alarm item by a competent service provider. Update the maintenance record once the system is confirmed operational.'
    },
    {
      match: /fire door|door closer|self-closing|smoke seal/i,
      priority: 'High',
      category: 'Fire Doors',
      recommendation: 'Repair or replace the affected fire door component so that the door closes and latches correctly. Confirm that smoke seals, closers, and hold-open arrangements remain compliant.'
    },
    {
      match: /emergency light|lighting|luminaire/i,
      priority: 'High',
      category: 'Emergency Lighting',
      recommendation: 'Test the emergency lighting point and repair or replace defective fittings or batteries. Record the result in the emergency lighting maintenance log.'
    },
    {
      match: /extinguisher|hose reel|fire equipment/i,
      priority: 'Medium',
      category: 'Fire Equipment',
      recommendation: 'Arrange servicing or replacement by a competent fire equipment contractor. Confirm correct location, signage, pressure or service tag status, and accessibility.'
    },
    {
      match: /electrical|db|distribution board|cable|plug/i,
      priority: 'Medium',
      category: 'Electrical',
      recommendation: 'Request inspection by a competent electrician and remove unsafe electrical conditions. Keep repair records and close the action once the item is made safe.'
    },
    {
      match: /storage|combustible|waste|housekeeping|flammable/i,
      priority: 'Medium',
      category: 'Housekeeping',
      recommendation: 'Remove excessive combustible storage or waste and restore good housekeeping. Keep ignition sources and electrical equipment clear of combustible materials.'
    },
    {
      match: /certificate|coc|record|document|service|maintenance/i,
      priority: 'Low',
      category: 'Documentation',
      recommendation: 'Obtain and file the required certificate, service record, or maintenance evidence. Keep the document available for future inspections and audits.'
    }
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalise(value) {
    return String(value || '').trim();
  }

  function getQuestionText(finding) {
    const answer = finding?.project?.answers?.[Number(finding?.itemIndex)] || {};
    return normalise(
      answer.question ||
      answer.checklistItem ||
      answer.text ||
      answer['Checklist Item'] ||
      finding?.note ||
      finding?.itemNumber ||
      ''
    );
  }

  function inferActionIntelligence(finding) {
    const text = [
      getQuestionText(finding),
      finding?.note,
      finding?.itemNumber
    ].join(' ');

    const matched = RULES.find(rule => rule.match.test(text));

    let priority = matched?.priority || (finding?.isOverdue ? 'High' : 'Medium');

    if (finding?.isOverdue && priority !== 'Critical') {
      priority = priority === 'Low' ? 'Medium' : 'High';
    }

    return {
      priority,
      category: matched?.category || 'General Fire Safety',
      recommendation: matched?.recommendation || DEFAULT_ACTION,
      questionText: getQuestionText(finding) || `Checklist item ${finding?.itemNumber || ''}`.trim()
    };
  }

  function priorityClass(priority) {
    const value = String(priority || '').toLowerCase();
    if (value === 'critical') return 'fire-s-ai-critical';
    if (value === 'high') return 'fire-s-ai-high';
    if (value === 'medium') return 'fire-s-ai-medium';
    return 'fire-s-ai-low';
  }

  function decorateFindingCards() {
    const cards = document.querySelectorAll('.finding-item-card');
    if (!cards.length || typeof window.getFilteredFindingsCentreItems !== 'function') return;

    const findings = window.getFilteredFindingsCentreItems();

    cards.forEach((card, index) => {
      if (card.dataset.fireSActionIntel === 'done') return;
      const finding = findings[index];
      if (!finding) return;

      const intel = inferActionIntelligence(finding);
      const riskBadge = card.querySelector('.finding-risk');

      if (riskBadge) {
        riskBadge.textContent = intel.priority;
        riskBadge.className = `finding-risk ${priorityClass(intel.priority)}`;
      }

      const panel = document.createElement('div');
      panel.className = 'fire-s-action-intel-panel';
      panel.innerHTML = `
        <div class="fire-s-action-intel-head">
          <span>${escapeHtml(intel.category)}</span>
          <strong>${escapeHtml(intel.priority)} Priority</strong>
        </div>
        <div class="fire-s-action-intel-question">${escapeHtml(intel.questionText)}</div>
        <div class="fire-s-action-intel-copy"><strong>Recommended Action:</strong> ${escapeHtml(intel.recommendation)}</div>
      `;

      const actions = card.querySelector('.finding-actions');
      if (actions) {
        card.insertBefore(panel, actions);
      } else {
        card.appendChild(panel);
      }

      card.dataset.fireSActionIntel = 'done';
    });
  }

  function installRenderWrapper() {
    if (typeof window.renderFindingsCentre === 'function' && !window.renderFindingsCentre.fireSActionIntelWrapped) {
      const original = window.renderFindingsCentre;
      window.renderFindingsCentre = function renderFindingsCentreWithActionIntel() {
        const result = original.apply(this, arguments);
        setTimeout(decorateFindingCards, 0);
        return result;
      };
      window.renderFindingsCentre.fireSActionIntelWrapped = true;
    }
  }

  window.FireSActionIntelligence = {
    inferActionIntelligence,
    decorateFindingCards,
    installRenderWrapper
  };

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      installRenderWrapper();
      decorateFindingCards();
    }, 650);
  });

  window.addEventListener('load', () => {
    setTimeout(() => {
      installRenderWrapper();
      decorateFindingCards();
    }, 900);
  });
})();
