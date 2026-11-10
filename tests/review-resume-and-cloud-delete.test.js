'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('staging/app.js');

assert.ok(
  /keepSavedAnswers: true/.test(app) &&
    /applySavedInspectionAnswers\(project\)/.test(app) &&
    /liveAnswersWouldWipeStored\(/.test(app),
  'Review & Finalise must reopen the saved answers and must not save a blank checklist over them'
);
assert.ok(
  !/renderPhotos\(\);\s*if \(typeof updateDisplay === 'function'\) updateDisplay\(\);/.test(app),
  'Photo recovery must not rebuild the checklist after the answers were filled in'
);
assert.ok(
  /fireSInspectionLockedFinal\(projects\[index\]\)/.test(app) &&
    /function fireSCycleFinalisedInHistory\(/.test(app),
  'A finished inspection must stay finished instead of dropping back to Review & Finalise'
);
assert.ok(
  /function forgetPremisesRemovedFromCloud\(/.test(app) &&
    /forgetPremisesRemovedFromCloud\(mergedProjects, data\)/.test(app),
  'A complete cloud pull must drop inspections that were deleted from the database'
);

const answerStart = app.indexOf('function inspectionAnswersHaveValues');
const answerEnd = app.indexOf('function clearInspectionAnswerUiState');
assert.ok(answerStart > 0 && answerEnd > answerStart);

const fields = {};
function field(id) {
  if (!fields[id]) fields[id] = { id, value: '', dataset: {} };
  return fields[id];
}
const answerSandbox = {
  document: {
    getElementById(id) { return field(id); },
    querySelector() { return field('expiry'); }
  },
  normaliseProfessionalAssessment(assessment, answer) {
    return assessment || answer || '';
  },
  setProfessionalAssessment() {}
};
vm.runInNewContext(app.slice(answerStart, answerEnd), answerSandbox);
answerSandbox.applySavedInspectionAnswers({
  answers: [
    { itemIndex: 0, answer: 'Yes', note: 'Hose reel checked', expiryDate: '2027-01-01' },
    { itemIndex: 1, answer: '', note: '' }
  ]
});
assert.strictEqual(fields.check_0.value, 'Yes');
assert.strictEqual(fields.note_0.value, 'Hose reel checked');
assert.strictEqual(fields.check_1.value, '');
assert.strictEqual(
  answerSandbox.liveAnswersWouldWipeStored(
    [{ answer: 'Yes' }],
    [{ answer: '' }, { answer: '' }]
  ),
  true
);
assert.strictEqual(
  answerSandbox.liveAnswersWouldWipeStored(
    [{ answer: 'Yes' }],
    [{ answer: 'No' }]
  ),
  false
);

const cloudStart = app.indexOf('function fireSCloudRowInspectionId');
const cloudEnd = app.indexOf('function fireSIsLocalProfileFallback');
const queued = [];
const removedFromQueue = [];
const deletedIds = {};
const cloudSandbox = {
  currentUserProfile: { companyId: 'co-1' },
  fireSIsDeletedPremises(project) {
    return !!(project && project.deletedAt);
  },
  fireSIsHiddenFromCurrentLists(project) {
    return !!(project && project.deletedAt);
  },
  queueInspectionForUpload(id) { queued.push(String(id)); },
  removeInspectionFromUploadQueue(id) { removedFromQueue.push(String(id)); },
  markProjectDeleted(id) { deletedIds[String(id)] = true; }
};
vm.runInNewContext(app.slice(cloudStart, cloudEnd), cloudSandbox);

const cloudRows = [
  { id: 'today', inspection_data: { id: 'today' } }
];
const local = [
  { id: 'old-1', companyId: 'co-1', syncPending: false, syncedAt: '2026-11-01T08:00:00.000Z' },
  { id: 'old-2', companyId: 'co-1', syncedAt: '2026-11-02T08:00:00.000Z', syncPending: true },
  { id: 'today', companyId: 'co-1', syncPending: false, syncedAt: '2026-11-10T08:00:00.000Z' },
  { id: 'new-on-phone', companyId: 'co-1', syncPending: true },
  { id: 'laptop-only', companyId: 'co-1' }
];
const kept = cloudSandbox.forgetPremisesRemovedFromCloud(local, cloudRows);
assert.strictEqual(
  kept.map(project => project.id).sort().join('|'),
  'laptop-only|new-on-phone|today'
);
assert.strictEqual(Object.keys(deletedIds).sort().join('|'), 'old-1|old-2');

queued.length = 0;
const queuedCount = cloudSandbox.queueLocalPremisesMissingFromCloud(local, cloudRows);
assert.strictEqual(queuedCount, 2);
assert.strictEqual(queued.map(id => id).sort().join('|'), 'laptop-only|new-on-phone');
assert.ok(removedFromQueue.indexOf('old-1') !== -1);

const emptyKept = cloudSandbox.forgetPremisesRemovedFromCloud(local, []);
assert.strictEqual(emptyKept.length, local.length, 'an empty cloud reply must not wipe the phone');

console.log('review-resume-and-cloud-delete.test.js: ok');
