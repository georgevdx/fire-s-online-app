/* Fire-S RC 1.1.4 - Action Register Polish
   Safe add-on: improves action categories, suggested responsibility/due dates,
   and hides duplicate-looking action cards in the UI without deleting data.
*/
(function () {
  'use strict';

  const VERSION = 'rc-1-1-4-action-register-polish';
  const PROJECTS_KEY = 'fireyeProjects';
  const GENERIC = /^(inspection|general|uncategorised|uncategorized|checklist|)$/i;

  const CATEGORY_RULES = [
    { category: 'Means of Escape', priority: 'Critical', responsible: 'Building Owner', dueDays: 7, match: /escape|egress|exit|stair|corridor|route|evacuat|door.*open|locked/i },
    { category: 'Fire Detection and Alarm', priority: 'High', responsible: 'Approved Contractor', dueDays: 21, match: /alarm|detect|detector|manual call point|mcp|sounder|panel|beacon/i },
    { category: 'Fixed Fire Suppression Systems', priority: 'Critical', responsible: 'Approved Contractor', dueDays: 14, match: /sprinkler|gas suppression|suppression|fixed firefighting|pump|tank|valve|booster/i },
    { category: 'Fire Equipment', priority: 'High', responsible: 'Approved Contractor', dueDays: 14, match: /extinguisher|hose reel|hydrant|fire equipment|fire blanket|brigade connection/i },
    { category: 'Emergency Lighting / Signage', priority: 'High', responsible: 'Electrical Contractor', dueDays: 21, match: /emergency light|exit sign|signage|luminaire|battery backup/i },
    { category: 'Fire Doors', priority: 'High', responsible: 'Building Owner', dueDays: 30, match: /fire door|self[- ]closing|door closer|smoke seal|wedged/i },
    { category: 'Electrical', priority: 'Medium', responsible: 'Electrical Contractor', dueDays: 21, match: /electrical|db|distribution board|cable|plug|generator|ups/i },
    { category: 'Hazardous Substances', priority: 'High', responsible: 'Site Manager', dueDays: 14, match: /hazard|flammable|chemical|fuel|lpg|gas cylinder|dangerous goods/i },
    { category: 'Smoke Control', priority: 'High', responsible: 'Approved Contractor', dueDays: 21, match: /smoke ventilation|smoke control|pressuri[sz]ation|extract|vent/i },
    { category: 'Housekeeping', priority: 'Medium', responsible: 'Site Manager', dueDays: 30, match: /housekeeping|storage|combustible|waste|rubbish|stock/i },
    { category: 'Documentation', priority: 'Medium', responsible: 'Building Owner', dueDays: 30, match: /certificate|coc|record|logbook|maintenance|service|document|drill|training/i }
  ];

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normal(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function readProjects() {
    try {
      if (typeof getProjects === 'function') return getProjects();
      return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    } catch (error) {
      console.warn('[Fire-S 1.1.4] Could not read projects', error);
      return [];
    }
  }

  function writeProjects(projects) {
    try {
      if (typeof setProjects === 'function') setProjects(projects);
      else localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects || []));
    } catch (error) {
      console.warn('[Fire-S 1.1.4] Could not save polished actions', error);
    }
  }

  function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + Number(days || 30));
    return d.toISOString().slice(0, 10);
  }

  function textFor(action) {
    return [
      action?.sectionName,
      action?.category,
      action?.question,
      action?.finding,
      action?.correctiveAction,
      action?.reference,
      action?.itemNumber
    ].filter(Boolean).join(' ');
  }

  function infer(action) {
    const text = textFor(action);
    return CATEGORY_RULES.find(rule => rule.match.test(text)) || {
      category: 'General Fire Safety',
      priority: action?.priority || 'Medium',
      responsible: action?.responsible || 'Building Owner',
      dueDays: 30
    };
  }

  function shouldReplaceCategory(value) {
    return !value || GENERIC.test(String(value).trim());
  }

  function isGenericCorrective(value) {
    const text = normal(value);
    return !text || text.includes('assign the item') || text.includes('review the non-compliant item');
  }

  function recommendationFor(category) {
    const value = normal(category);
    if (value.includes('escape')) return 'Restore the escape route or exit condition and verify that the evacuation path remains clear and usable.';
    if (value.includes('detection') || value.includes('alarm')) return 'Arrange testing and repair by a competent fire detection contractor and retain the service evidence.';
    if (value.includes('suppression') || value.includes('sprinkler')) return 'Arrange urgent inspection by a competent fire protection contractor and confirm the system is serviceable.';
    if (value.includes('equipment')) return 'Service, replace, reposition or make the fire equipment accessible and retain updated service records.';
    if (value.includes('lighting') || value.includes('signage')) return 'Repair or replace defective emergency lighting/signage and verify operation under test conditions.';
    if (value.includes('door')) return 'Repair or reinstate the fire door so that it closes, latches and is not held open by unauthorised means.';
    if (value.includes('electrical')) return 'Refer the item to a competent electrical contractor and remove unsafe electrical conditions.';
    if (value.includes('hazardous')) return 'Review storage, separation, labelling and documentation for hazardous substances and correct non-compliant conditions.';
    if (value.includes('housekeeping')) return 'Remove combustible storage/waste and maintain clear access to fire equipment and escape routes.';
    if (value.includes('document')) return 'Obtain and file the required certificate, service record or maintenance evidence.';
    return 'Assign responsibility, set a target date and close the action with evidence after verification.';
  }

  function polishAction(action) {
    const rule = infer(action);
    const next = { ...action };
    let changed = false;

    if (shouldReplaceCategory(next.sectionName)) {
      next.sectionName = rule.category;
      changed = true;
    }

    if (shouldReplaceCategory(next.category)) {
      next.category = rule.category;
      changed = true;
    }

    if (!next.priority || GENERIC.test(next.priority)) {
      next.priority = rule.priority;
      changed = true;
    }

    if (!next.responsible || /not assigned|building owner/i.test(String(next.responsible || '')) && rule.responsible !== 'Building Owner') {
      next.responsible = rule.responsible;
      changed = true;
    }

    if (!next.dueDate) {
      next.dueDate = addDays(rule.dueDays);
      changed = true;
    }

    if (isGenericCorrective(next.correctiveAction)) {
      next.correctiveAction = recommendationFor(rule.category);
      changed = true;
    }

    if (changed) {
      next.actionPolishedAt = new Date().toISOString();
      next.actionPolishVersion = VERSION;
    }

    return { action: next, changed };
  }

  function polishAllProjectActions() {
    const projects = readProjects();
    let changed = false;

    const nextProjects = projects.map(project => {
      if (!Array.isArray(project?.actions) || project.actions.length === 0) return project;

      const polished = project.actions.map(action => {
        const result = polishAction(action);
        if (result.changed) changed = true;
        return result.action;
      });

      return changed ? { ...project, actions: polished, lastSaved: new Date().toISOString(), syncPending: true } : project;
    });

    if (changed) {
      writeProjects(nextProjects);
      if (typeof renderProjectsList === 'function') {
        try { renderProjectsList(); } catch (_) {}
      }
    }

    return changed;
  }

  function hideDuplicateActionCards() {
    const cards = Array.from(document.querySelectorAll('.fire-s-action-card-v1033'));
    if (!cards.length) return;

    const seen = new Set();
    let hiddenCount = 0;

    cards.forEach(card => {
      const text = normal(card.textContent);
      const key = text
        .replace(/ac-\d{4}-\d{6}/g, '')
        .replace(/live-\d+/g, '')
        .replace(/open|in progress|waiting|closed/g, '')
        .slice(0, 180);

      if (seen.has(key)) {
        card.style.display = 'none';
        hiddenCount += 1;
      } else {
        seen.add(key);
        card.style.display = '';
      }
    });

    const panel = document.getElementById('fireSActionRegisterPanelV1033');
    if (panel) {
      let note = document.getElementById('fireSActionPolishNote1114');
      if (!note && hiddenCount) {
        note = document.createElement('div');
        note.id = 'fireSActionPolishNote1114';
        note.className = 'fire-s-action-polish-note-1114';
        panel.insertBefore(note, panel.firstChild);
      }
      if (note) {
        note.style.display = hiddenCount ? 'block' : 'none';
        note.textContent = hiddenCount
          ? `${hiddenCount} duplicate-looking action card${hiddenCount === 1 ? '' : 's'} hidden in this view. Original action data was not deleted.`
          : '';
      }
    }
  }

  function addCompactLegend() {
    const panel = document.getElementById('fireSActionRegisterPanelV1033');
    if (!panel || document.getElementById('fireSActionLegend1114')) return;

    const legend = document.createElement('div');
    legend.id = 'fireSActionLegend1114';
    legend.className = 'fire-s-action-legend-1114';
    legend.innerHTML = `
      <strong>Action Register</strong>
      <span>Categories, priority and due dates are auto-cleaned from checklist context.</span>
    `;
    panel.insertBefore(legend, panel.firstChild);
  }

  function runUiPolish() {
    addCompactLegend();
    hideDuplicateActionCards();
  }

  function init() {
    setTimeout(polishAllProjectActions, 700);
    setTimeout(runUiPolish, 1000);
    setInterval(runUiPolish, 2500);

    document.addEventListener('click', event => {
      if (event.target?.closest?.('[data-action-filter], .project-open-btn, [onclick*="openProject"]')) {
        setTimeout(polishAllProjectActions, 300);
        setTimeout(runUiPolish, 600);
      }
    }, true);
  }

  window.FireSActionPolish1114 = {
    version: VERSION,
    polishAllProjectActions,
    runUiPolish,
    infer
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
