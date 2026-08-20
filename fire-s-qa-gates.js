/* Fire-S Q&A gates
   If a section gate is answered No / N/A (not required), hide the following
   questions in that section and mark them N/A so they do not create findings.
   Yes keeps the follow-up questions visible.
*/
(function () {
  'use strict';

  const HIDDEN_CLASS = 'fire-s-gate-hidden';
  let applyTimer = 0;

  function normalise(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isHideAnswer(value) {
    const v = normalise(value);
    return v === 'no' || v === 'n/a' || v === 'na' || v === 'not applicable';
  }

  function followUpRows(gateRow) {
    const section = gateRow?.closest?.('.section-group');
    if (!section) return [];
    const rows = Array.from(section.querySelectorAll('.checklist-row'));
    const start = rows.indexOf(gateRow);
    if (start < 0) return [];
    const following = [];
    for (let i = start + 1; i < rows.length; i += 1) {
      if (rows[i].dataset.gateQuestion === 'true') break;
      following.push(rows[i]);
    }
    return following;
  }

  function restoreAssessment(row) {
    const select = row.querySelector('.answer-select');
    if (!select) return;
    const savedAnswer = row.dataset.gateSavedAnswer;
    const savedAssessment = row.dataset.gateSavedAssessment;
    delete row.dataset.gateSavedAnswer;
    delete row.dataset.gateSavedAssessment;
    const itemIndex = Number(row.dataset.index);
    if (savedAnswer === undefined) return;
    const assessment =
      savedAssessment ||
      (savedAnswer === 'Yes'
        ? 'Compliant'
        : savedAnswer === 'No'
        ? 'Action Required'
        : savedAnswer === 'N/A'
        ? 'N/A'
        : '');
    if (typeof window.setProfessionalAssessment === 'function') {
      window.setProfessionalAssessment(itemIndex, assessment, {
        skipAutoSave: true,
        skipGate: true
      });
    } else {
      select.value = savedAnswer || '';
      select.dataset.assessment = assessment;
    }
  }

  function hideFollowUp(row) {
    const select = row.querySelector('.answer-select');
    if (!row.classList.contains(HIDDEN_CLASS) && select) {
      row.dataset.gateSavedAnswer = select.value || '';
      row.dataset.gateSavedAssessment = select.dataset.assessment || '';
    }
    row.classList.add(HIDDEN_CLASS);
    row.setAttribute('aria-hidden', 'true');
    const itemIndex = Number(row.dataset.index);
    if (typeof window.setProfessionalAssessment === 'function') {
      window.setProfessionalAssessment(itemIndex, 'N/A', {
        skipAutoSave: true,
        skipGate: true
      });
    } else if (select) {
      select.value = 'N/A';
      select.dataset.assessment = 'N/A';
    }
  }

  function showFollowUp(row) {
    const wasHidden = row.classList.contains(HIDDEN_CLASS);
    row.classList.remove(HIDDEN_CLASS);
    row.removeAttribute('aria-hidden');
    if (wasHidden) restoreAssessment(row);
  }

  function applyGate(gateRow) {
    if (!gateRow) return;
    const value = gateRow.querySelector('.answer-select')?.value || '';
    const followUps = followUpRows(gateRow);
    if (!value) {
      followUps.forEach(showFollowUp);
      return;
    }
    const hide = isHideAnswer(value);
    followUps.forEach(row => {
      if (hide) hideFollowUp(row);
      else showFollowUp(row);
    });
  }

  function applyAllGates() {
    document
      .querySelectorAll('.checklist-row[data-gate-question="true"]')
      .forEach(applyGate);
    if (typeof window.updateAnswerSummary === 'function') {
      window.updateAnswerSummary();
    }
  }

  function scheduleApplyAllGates() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(applyAllGates, 0);
  }

  function wrapFunction(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.__fireSQaGates) return;
    const wrapped = function fireSQaGatesWrapped() {
      const result = original.apply(this, arguments);
      if (name === 'setProfessionalAssessment') {
        const options = arguments[2] || {};
        if (options.skipGate) return result;
        const itemIndex = arguments[0];
        const row = document.querySelector(
          `.checklist-row[data-index="${itemIndex}"]`
        );
        if (row?.dataset.gateQuestion === 'true') scheduleApplyAllGates();
        return result;
      }
      applyAllGates();
      return result;
    };
    wrapped.__fireSQaGates = true;
    window[name] = wrapped;
  }

  function install() {
    wrapFunction('renderChecklist');
    wrapFunction('setProfessionalAssessment');
  }

  document.addEventListener(
    'change',
    event => {
      const field = event.target;
      if (!field?.classList?.contains('answer-select')) return;
      const row = field.closest('.checklist-row');
      if (row?.dataset.gateQuestion === 'true') scheduleApplyAllGates();
    },
    true
  );

  install();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  }
  setTimeout(install, 0);
  setTimeout(install, 400);

  window.FireSQaGates = {
    applyGate,
    applyAllGates,
    isHideAnswer
  };
})();
