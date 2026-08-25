/* Fire-S RC 1.1.6 - Conditional Sections Foundation
   Safe mobile-first inspection engine.
   If a section trigger is answered N/A (or No for explicit installed/present questions),
   unanswered downstream questions in the same section are marked as N/A and visually skipped.
   Existing answered questions are not overwritten.
*/
(function () {
  'use strict';

  const VERSION = 'RC 1.1.6 - Conditional Sections Foundation';
  const SKIP_CLASS = 'fire-s-conditional-skipped';
  const TRIGGER_CLASS = 'fire-s-conditional-trigger';

  const SECTION_KEYWORDS = [
    'sprinkler',
    'suppression',
    'gas suppression',
    'fixed fire',
    'hazardous',
    'smoke',
    'ventilation',
    'fire detection',
    'alarm',
    'pump',
    'hydrant',
    'emergency lighting'
  ];

  function normalise(value) {
    return String(value || '').trim().toLowerCase();
  }

  function rowText(row) {
    return normalise(row ? row.textContent : '');
  }

  function sectionNameFor(row) {
    const group = row?.closest?.('.section-group');
    return normalise(group?.dataset?.sectionName || group?.querySelector('.section-heading,.section-header')?.textContent || '');
  }

  function rowLooksRelevant(row) {
    const text = `${sectionNameFor(row)} ${rowText(row)}`;
    return SECTION_KEYWORDS.some(keyword => text.includes(keyword));
  }

  function isTriggerRow(row) {
    const text = rowText(row);
    if (!rowLooksRelevant(row)) return false;

    return (
      /\b(if required|where required|where .* required|if .* installed|where .* installed)\b/i.test(text) ||
      /\b(installed|provided|present|available|on site|in place)\b/i.test(text)
    );
  }

  function triggerMode(row) {
    const text = rowText(row);
    // Conservative mode: questions phrased as "if/where required" only skip on N/A.
    if (/\b(if required|where required|where .* required)\b/i.test(text)) return 'na-only';
    return 'no-or-na';
  }

  function isSkipAnswer(value) {
    const v = normalise(value);
    return v === 'n/a' || v === 'na' || v === 'not applicable';
  }

  function shouldSkipFrom(triggerSelect) {
    const row = triggerSelect?.closest?.('.checklist-row');
    if (!row || !isTriggerRow(row)) return false;

    const value = normalise(triggerSelect.value);
    const mode = triggerMode(row);

    if (mode === 'na-only') return isSkipAnswer(value);
    return value === 'no' || isSkipAnswer(value);
  }

  function ensureNotice(row, text) {
    if (!row || row.querySelector('.fire-s-skip-notice')) return;
    const notice = document.createElement('div');
    notice.className = 'fire-s-skip-notice';
    notice.textContent = text || 'Skipped – Not Applicable';
    const select = row.querySelector('.answer-select');
    if (select) select.insertAdjacentElement('afterend', notice);
    else row.appendChild(notice);
  }

  function clearNotice(row) {
    row?.querySelectorAll?.('.fire-s-skip-notice')?.forEach(el => el.remove());
  }

  function markTriggerRows() {
    document.querySelectorAll('.checklist-row').forEach(row => {
      if (isTriggerRow(row)) {
        row.classList.add(TRIGGER_CLASS);
        ensureTriggerHint(row);
      } else {
        row.classList.remove(TRIGGER_CLASS);
      }
    });
  }

  function ensureTriggerHint(row) {
    if (!row || row.querySelector('.fire-s-trigger-hint')) return;
    const hint = document.createElement('div');
    hint.className = 'fire-s-trigger-hint';
    hint.textContent = 'Conditional section: N/A/No can skip unanswered related questions.';
    const note = row.querySelector('.note');
    if (note) note.insertAdjacentElement('afterend', hint);
    else row.appendChild(hint);
  }

  function clearSectionSkips(sectionIndex, afterPosition) {
    const rows = Array.from(document.querySelectorAll(`.checklist-row[data-section-index="${sectionIndex}"]`));
    rows.slice(afterPosition + 1).forEach(row => {
      const select = row.querySelector('.answer-select');
      row.classList.remove(SKIP_CLASS);
      row.dataset.fireSSkipped = '';
      if (select && select.dataset.fireSAutoSkipped === 'true') {
        select.disabled = false;
        select.value = '';
        select.dataset.fireSAutoSkipped = '';
        if (typeof window.handleAnswerChange === 'function') {
          try { window.handleAnswerChange(select, { skipAutoSave: true }); } catch (_) {}
        }
      } else if (select) {
        select.disabled = false;
      }
      row.querySelectorAll('textarea,input').forEach(field => { field.disabled = false; });
      clearNotice(row);
    });
  }

  function applySectionSkip(triggerSelect) {
    const triggerRow = triggerSelect?.closest?.('.checklist-row');
    if (!triggerRow) return;

    const sectionIndex = triggerRow.dataset.sectionIndex;
    const rows = Array.from(document.querySelectorAll(`.checklist-row[data-section-index="${sectionIndex}"]`));
    const triggerPosition = rows.indexOf(triggerRow);

    clearSectionSkips(sectionIndex, triggerPosition);

    if (!shouldSkipFrom(triggerSelect)) {
      updateSkipSummary();
      return;
    }

    const sectionName = sectionNameFor(triggerRow) || 'this section';
    rows.slice(triggerPosition + 1).forEach(row => {
      const select = row.querySelector('.answer-select');
      const currentValue = normalise(select?.value || '');

      row.classList.add(SKIP_CLASS);
      row.dataset.fireSSkipped = 'true';

      // Do not overwrite existing answers. Only auto-fill unanswered rows as N/A.
      if (select && !currentValue) {
        select.value = 'N/A';
        select.dataset.fireSAutoSkipped = 'true';
        if (typeof window.handleAnswerChange === 'function') {
          try { window.handleAnswerChange(select, { skipAutoSave: true }); } catch (_) {}
        }
      }

      if (select && select.dataset.fireSAutoSkipped === 'true') {
        select.disabled = true;
      }
      row.querySelectorAll('textarea,input').forEach(field => {
        if (!String(field.value || '').trim()) field.disabled = true;
      });
      ensureNotice(row, `Skipped – Not Applicable for ${sectionName}`);
    });

    updateSkipSummary();
  }

  function updateSkipSummary() {
    const skipped = document.querySelectorAll(`.${SKIP_CLASS}`).length;
    let box = document.getElementById('fireSConditionalSummary');
    const checklist = document.getElementById('checklist');
    if (!checklist) return;

    if (!box) {
      box = document.createElement('div');
      box.id = 'fireSConditionalSummary';
      box.className = 'fire-s-conditional-summary';
      const toolbar = checklist.querySelector('.checklist-toolbar');
      if (toolbar) toolbar.insertAdjacentElement('afterend', box);
      else checklist.prepend(box);
    }

    if (!skipped) {
      box.style.display = 'none';
      box.textContent = '';
      return;
    }

    box.style.display = 'block';
    box.textContent = `${skipped} question${skipped === 1 ? '' : 's'} skipped as Not Applicable. Existing answered questions were not overwritten.`;
  }

  function refreshAll() {
    markTriggerRows();
    document.querySelectorAll(`.${SKIP_CLASS}`).forEach(row => {
      row.classList.remove(SKIP_CLASS);
      row.dataset.fireSSkipped = '';
      clearNotice(row);
    });
    document.querySelectorAll('.answer-select').forEach(select => {
      select.disabled = false;
      if (select.dataset.fireSAutoSkipped === 'true') {
        select.value = '';
        select.dataset.fireSAutoSkipped = '';
      }
    });
    document.querySelectorAll('.answer-select').forEach(select => {
      if (shouldSkipFrom(select)) applySectionSkip(select);
    });
    updateSkipSummary();
  }

  function install() {
    if (window.__fireSConditionalSectionsInstalled) return;
    window.__fireSConditionalSectionsInstalled = true;

    const originalHandle = window.handleAnswerChange;
    if (typeof originalHandle === 'function') {
      window.handleAnswerChange = function patchedHandleAnswerChange(selectEl, options) {
        const result = originalHandle.apply(this, arguments);
        setTimeout(() => applySectionSkip(selectEl), 0);
        return result;
      };
    }

    const originalRenderChecklist = window.renderChecklist;
    if (typeof originalRenderChecklist === 'function') {
      window.renderChecklist = function patchedRenderChecklist() {
        const result = originalRenderChecklist.apply(this, arguments);
        setTimeout(refreshAll, 0);
        return result;
      };
    }

    document.addEventListener('change', event => {
      if (event.target?.classList?.contains('answer-select')) {
        applySectionSkip(event.target);
      }
    }, true);

    window.FireSConditionalSections = {
      VERSION,
      refresh: refreshAll
    };

    setTimeout(refreshAll, 800);
    setTimeout(refreshAll, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();
