/* Fire-S Finish Inspection
   Keep Finish Inspection tappable. Count the answers on screen, not a stale
   saved copy. If a question is still empty, open that question. */
(function fireSFinishUnlock() {
  'use strict';

  if (window.__fireSFinishUnlock) return;
  window.__fireSFinishUnlock = true;

  function isHistory() {
    return Boolean(
      (typeof window.isInspectionHistoryWriteProtected === 'function' &&
        window.isInspectionHistoryWriteProtected()) ||
      document.body.classList.contains('fire-s-history-view-mode') ||
      window.fireSHistoryViewMode
    );
  }

  function isAnsweredValue(value) {
    const v = String(value || '').trim().toLowerCase();
    return v === 'yes' || v === 'no' || v === 'n/a' || v === 'na' || v === 'not applicable';
  }

  function liveCompletion() {
    const fields = Array.from(document.querySelectorAll('.answer-select'));
    const answered = fields.filter(field => isAnsweredValue(field.value)).length;
    return {
      total: fields.length,
      answered,
      unanswered: Math.max(0, fields.length - answered)
    };
  }

  function firstUnansweredField() {
    return Array.from(document.querySelectorAll('.answer-select')).find(field => {
      if (field.closest('.fire-s-gate-hidden')) return false;
      return !isAnsweredValue(field.value);
    }) || null;
  }

  function revealField(field) {
    if (!field) return;
    const row = field.closest('.checklist-row');
    const sectionIndex = Number(row && row.dataset.sectionIndex);
    if (Number.isFinite(sectionIndex) && typeof window.openChecklistSection === 'function') {
      window.openChecklistSection(sectionIndex, false);
    }
    if (row) {
      row.classList.remove('question-hidden');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function syncButtons() {
    if (isHistory()) return;
    const finishBtn = document.getElementById('finishBtn');
    const reportBtn = document.getElementById('reportBtn');
    if (finishBtn) {
      finishBtn.disabled = false;
      finishBtn.textContent = 'Finish Inspection';
      finishBtn.title = 'Tap to finish this inspection.';
    }
    if (reportBtn) {
      reportBtn.disabled = false;
    }
  }

  function wrapFinish() {
    const original = window.finishInspection;
    if (typeof original !== 'function' || original.__fireSFinishUnlock) return;
    const wrapped = function fireSFinishInspectionClickable() {
      if (isHistory()) return;
      try {
        if (window.FireSQaGates && typeof window.FireSQaGates.applyAllGates === 'function') {
          window.FireSQaGates.applyAllGates();
        }
      } catch (_) {}

      const counts = liveCompletion();
      if (!(counts.total > 0 && counts.unanswered === 0)) {
        revealField(firstUnansweredField());
        alert(
          counts.total === 0
            ? 'There is no checklist yet. Choose occupancy, tap Expand, then answer the questions.'
            : 'This inspection is not finished yet.\n\n' +
              counts.unanswered +
              ' question' +
              (counts.unanswered === 1 ? '' : 's') +
              ' still need an answer.\n\nI opened the first empty one.'
        );
        syncButtons();
        return;
      }
      return original.apply(this, arguments);
    };
    wrapped.__fireSFinishUnlock = true;
    window.finishInspection = wrapped;
    try {
      window.eval('finishInspection = window.finishInspection');
    } catch (_) {}
  }

  if (window.FireSFinalisationEngine && typeof window.FireSFinalisationEngine.refresh === 'function') {
    const originalRefresh = window.FireSFinalisationEngine.refresh;
    window.FireSFinalisationEngine.refresh = function fireSFinishUnlockRefresh() {
      originalRefresh.apply(this, arguments);
      syncButtons();
    };
  }

  wrapFinish();
  syncButtons();

  document.addEventListener('click', event => {
    if (event.target && event.target.closest && event.target.closest('.assessment-chip, #finishBtn')) {
      wrapFinish();
      syncButtons();
    }
  }, true);

  window.fireSIsAnsweredChecklistValue = isAnsweredValue;
  window.fireSLiveChecklistCompletion = liveCompletion;
  window.fireSRevealFirstUnansweredChecklistItem = function fireSRevealFirstUnansweredChecklistItem() {
    revealField(firstUnansweredField());
  };
})();
