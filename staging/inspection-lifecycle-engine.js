/*
 * Fire-S Inspection Lifecycle Engine v1.0
 * - Draft inspections may be saved at any stage.
 * - Action Items / Inspection Review unlock only when every checklist item is answered.
 * - Incomplete inspections cannot be finalised or moved to Inspection History.
 * - Reopening an incomplete premises inspection goes directly into edit mode.
 * - Photos remain optional and do not affect checklist completion.
 */
(function () {
  'use strict';

  const ANSWERED_VALUES = new Set(['yes', 'no', 'n/a']);
  let completionPopupOpen = false;
  let lastCompletionState = false;
  let popupShownForProjectId = null;

  function normalise(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getDomCompletion() {
    const fields = Array.from(document.querySelectorAll('.answer-select'));
    const total = fields.length;
    const answered = fields.filter(field => ANSWERED_VALUES.has(normalise(field.value))).length;
    return {
      total,
      answered,
      unanswered: Math.max(total - answered, 0),
      complete: total > 0 && answered === total
    };
  }

  function getProjectCompletion(project) {
    if (!project) return { total: 0, answered: 0, unanswered: 0, complete: false };

    if (typeof window.getProjectCompletionCounts === 'function') {
      const counts = window.getProjectCompletionCounts(project);
      return {
        ...counts,
        complete: counts.total > 0 && counts.unanswered === 0
      };
    }

    const answers = Array.isArray(project.answers) ? project.answers : [];
    const total = answers.length;
    const answered = answers.filter(answer => ANSWERED_VALUES.has(normalise(answer.answer))).length;
    return {
      total,
      answered,
      unanswered: Math.max(total - answered, 0),
      complete: total > 0 && answered === total
    };
  }

  function currentProjectRecord() {
    if (!window.currentProjectId || typeof window.getProjects !== 'function') return null;
    return window.getProjects().find(project => project.id === window.currentProjectId) || null;
  }

  function ensureStyles() {
    if (document.getElementById('inspectionLifecycleStyles')) return;
    const style = document.createElement('style');
    style.id = 'inspectionLifecycleStyles';
    style.textContent = `
      .inspection-review-locked {
        position: relative;
        min-height: 132px;
        overflow: hidden;
      }
      .inspection-review-locked > :not(.inspection-review-lock-message) {
        display: none !important;
      }
      .inspection-review-lock-message {
        display: grid;
        gap: 7px;
        padding: 18px;
        border: 1px solid #d9dee8;
        border-radius: 14px;
        background: #f7f8fb;
      }
      .inspection-review-lock-message strong { font-size: 1rem; }
      .inspection-review-lock-message span { color: #566171; line-height: 1.45; }
      .inspection-complete-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10050;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(17, 24, 39, .58);
      }
      .inspection-complete-dialog {
        width: min(520px, 100%);
        border-radius: 18px;
        background: #fff;
        box-shadow: 0 24px 70px rgba(0,0,0,.28);
        padding: 24px;
      }
      .inspection-complete-dialog h2 { margin: 0 0 8px; }
      .inspection-complete-dialog p { margin: 0; color: #4b5563; line-height: 1.5; }
      .inspection-complete-count {
        margin: 18px 0;
        padding: 13px 15px;
        border-radius: 12px;
        background: #eef7f1;
        font-weight: 700;
      }
      .inspection-complete-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }
      .inspection-complete-actions button {
        min-height: 42px;
        padding: 10px 16px;
        border-radius: 10px;
        cursor: pointer;
      }
      .inspection-complete-primary {
        border: 0;
        background: #163b67;
        color: #fff;
        font-weight: 700;
      }
      .inspection-complete-secondary {
        border: 1px solid #cbd2dc;
        background: #fff;
        color: #273444;
      }
    `;
    document.head.appendChild(style);
  }

  function findReviewPanels() {
    return [
      document.getElementById('smartActionEnginePanel'),
      document.getElementById('inspectionActionPanel'),
      document.getElementById('inspectionReviewPanel')
    ].filter(Boolean);
  }

  function setReviewLock(completion) {
    findReviewPanels().forEach(panel => {
      let message = panel.querySelector(':scope > .inspection-review-lock-message');

      if (!completion.complete) {
        panel.classList.add('inspection-review-locked');
        if (!message) {
          message = document.createElement('div');
          message.className = 'inspection-review-lock-message';
          panel.prepend(message);
        }
        message.innerHTML = `
          <strong>Inspection Review locked</strong>
          <span>Complete all checklist items to activate Action Items.</span>
          <span>${completion.answered} / ${completion.total} checklist items answered.</span>
        `;
      } else {
        panel.classList.remove('inspection-review-locked');
        if (message) message.remove();
      }
    });
  }

  function closeCompletionPopup() {
    const popup = document.getElementById('inspectionCompletePopup');
    if (popup) popup.remove();
    completionPopupOpen = false;
  }

  function reviewInspection() {
    closeCompletionPopup();
    if (typeof window.saveProject === 'function') window.saveProject();
    const completion = getDomCompletion();
    setReviewLock(completion);
    const panel = findReviewPanels()[0];
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof window.setReadinessMessage === 'function') {
      window.setReadinessMessage('Checklist complete. Inspection Review is ready.');
    }
  }

  function showCompletionPopup(completion) {
    if (completionPopupOpen) return;
    completionPopupOpen = true;

    const backdrop = document.createElement('div');
    backdrop.id = 'inspectionCompletePopup';
    backdrop.className = 'inspection-complete-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'inspectionCompleteTitle');
    backdrop.innerHTML = `
      <div class="inspection-complete-dialog">
        <h2 id="inspectionCompleteTitle">Inspection checklist completed</h2>
        <p>All checklist items have been answered. Action Items and Inspection Review are now available.</p>
        <div class="inspection-complete-count">${completion.answered} / ${completion.total} checklist items completed</div>
        <p>Photos remain optional unless the premises owner or company policy requires them.</p>
        <div class="inspection-complete-actions">
          <button type="button" class="inspection-complete-secondary" id="continueInspectionEditingBtn">Continue Editing</button>
          <button type="button" class="inspection-complete-primary" id="reviewCompletedInspectionBtn">Review Inspection</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    document.getElementById('continueInspectionEditingBtn')?.addEventListener('click', closeCompletionPopup);
    document.getElementById('reviewCompletedInspectionBtn')?.addEventListener('click', reviewInspection);
  }

  function evaluateLifecycle(options = {}) {
    const completion = getDomCompletion();
    setReviewLock(completion);

    const projectId = window.currentProjectId || null;
    if (!completion.complete) {
      popupShownForProjectId = null;
    }

    const justCompleted = completion.complete && !lastCompletionState;
    lastCompletionState = completion.complete;

    if (
      options.allowPopup !== false &&
      justCompleted &&
      projectId &&
      popupShownForProjectId !== projectId
    ) {
      popupShownForProjectId = projectId;
      window.setTimeout(() => showCompletionPopup(completion), 80);
    }

    return completion;
  }

  function updateSavedLifecycleStatus() {
    const completion = getDomCompletion();
    if (!window.currentProjectId || typeof window.getProjects !== 'function' || typeof window.setProjects !== 'function') return;

    const projects = window.getProjects();
    const index = projects.findIndex(project => project.id === window.currentProjectId);
    if (index === -1 || projects[index].completedAt) return;

    projects[index] = {
      ...projects[index],
      currentInspectionStatus: completion.complete ? 'Ready for Review' : 'In Progress',
      checklistCompletedAt: completion.complete
        ? (projects[index].checklistCompletedAt || new Date().toISOString())
        : null,
      checklistCompletion: {
        answered: completion.answered,
        total: completion.total
      }
    };
    window.setProjects(projects);
    window.currentProject = projects[index];
  }

  function installFunctionGuards() {
    if (typeof window.saveProject === 'function' && !window.saveProject.__lifecycleWrapped) {
      const originalSaveProject = window.saveProject;
      const wrappedSaveProject = function () {
        const result = originalSaveProject.apply(this, arguments);
        updateSavedLifecycleStatus();
        evaluateLifecycle({ allowPopup: false });
        return result;
      };
      wrappedSaveProject.__lifecycleWrapped = true;
      window.saveProject = wrappedSaveProject;
    }

    if (typeof window.finishInspection === 'function' && !window.finishInspection.__lifecycleWrapped) {
      const originalFinishInspection = window.finishInspection;
      const wrappedFinishInspection = function () {
        const completion = getDomCompletion();
        if (!completion.complete) {
          if (typeof window.saveProject === 'function') window.saveProject();
          alert(
            `Inspection saved as incomplete.\n\n${completion.unanswered} checklist item${completion.unanswered === 1 ? '' : 's'} must still be answered before this inspection can be finalised and moved to Inspection History.`
          );
          const firstUnanswered = Array.from(document.querySelectorAll('.answer-select'))
            .find(field => !ANSWERED_VALUES.has(normalise(field.value)));
          firstUnanswered?.closest('.checklist-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstUnanswered?.focus({ preventScroll: true });
          return;
        }
        return originalFinishInspection.apply(this, arguments);
      };
      wrappedFinishInspection.__lifecycleWrapped = true;
      window.finishInspection = wrappedFinishInspection;
    }

    if (typeof window.shouldShowInspectionOpenGate === 'function' && !window.shouldShowInspectionOpenGate.__lifecycleWrapped) {
      const originalOpenGate = window.shouldShowInspectionOpenGate;
      const wrappedOpenGate = function (project, focusMode) {
        const completion = getProjectCompletion(project);
        if (!project?.completedAt && !completion.complete) {
          return false;
        }
        return originalOpenGate.apply(this, arguments);
      };
      wrappedOpenGate.__lifecycleWrapped = true;
      window.shouldShowInspectionOpenGate = wrappedOpenGate;
    }
  }

  function handleChecklistChange(event) {
    if (!event.target.closest('.answer-select')) return;
    window.setTimeout(() => evaluateLifecycle({ allowPopup: true }), 30);
  }

  function initialise() {
    ensureStyles();
    installFunctionGuards();
    document.addEventListener('change', handleChecklistChange, true);

    const observer = new MutationObserver(() => {
      installFunctionGuards();
      if (document.querySelector('.answer-select')) {
        evaluateLifecycle({ allowPopup: false });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.setInterval(installFunctionGuards, 1000);
    window.FireSInspectionLifecycle = {
      evaluate: evaluateLifecycle,
      getCompletion: getDomCompletion,
      reviewInspection
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise, { once: true });
  } else {
    initialise();
  }
})();
