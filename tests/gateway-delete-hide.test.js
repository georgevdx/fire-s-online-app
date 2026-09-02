'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('staging/app.js');
const env = read('staging/fire-s-env.js');
const liveApp = read('app.js');
const liveEnv = read('fire-s-env.js');

assert.ok(/1\.3\.56-toets/.test(env), 'Toets-blad version must be 1.3.56-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.51'/.test(liveEnv),
  'Live Fire-S must be 1.3.51 after sit dit live'
);

assert.ok(
  /function fireSIsEmptyRecycleLeftoverPremises\(project\)/.test(app),
  'Gateway must know when a deleted incomplete inspection left an empty premises shell'
);
assert.ok(
  /!fireSIsEmptyRecycleLeftoverPremises\(project\)/.test(app),
  'Visible premises list must drop empty Recycle leftovers'
);
assert.ok(
  /window\.fireSIsEmptyRecycleLeftoverPremises === 'function'\) \{\s*list = list\.filter\(project => !window\.fireSIsEmptyRecycleLeftoverPremises\(project\)\)/.test(app),
  'Inspection Gateway cards must hide empty Recycle leftovers'
);
assert.ok(
  /Never bring a locally deleted premises or empty Recycle leftover back/.test(app),
  'Cloud download must not restore a deleted or leftover card'
);
assert.ok(
  /if \(typeof markProjectDeleted === 'function'\) markProjectDeleted\(projectId\)/.test(app),
  'Delete Entire Premises must register the id so cloud download cannot restore it'
);
assert.ok(
  /removeInspectionFromUploadQueue\(idToDelete\)/.test(app),
  'Legacy delete must stop a pending upload from putting the card back'
);

const deleteFn = app.slice(
  app.indexOf('async function deleteProject()'),
  app.indexOf('function updateDisplay()')
);
assert.ok(deleteFn.includes('async function deleteProject()'), 'deleteProject must exist');
assert.ok(
  !/alert\('Cloud delete skipped: user not logged in\.'\);\s*return;/.test(deleteFn),
  'Delete must still return to the list when cloud delete is skipped'
);
assert.ok(
  /showProjectList\(\);/.test(deleteFn),
  'Delete must always return to the Inspection Gateway list'
);
assert.ok(
  !/alert\(`Deleted on this device\. Cloud delete failed: \$\{error\.message\}`\);\s*return;/.test(deleteFn) &&
    !/alert\('Cloud delete failed\. Check console\.'\);\s*return;/.test(deleteFn),
  'A cloud delete error must not keep the user on the form with the card still listed'
);

const start = app.indexOf('function fireSHasRecycledCurrentInspection');
const end = app.indexOf('function fireSIsInspectionOverdue');
assert.ok(start >= 0 && end > start, 'Leftover helpers must sit together');
const helpers = app.slice(start, end);
const result = {
  leftover: null,
  withHistory: null,
  live: null,
  scheduled: null,
  plain: null
};
vm.runInNewContext(
  helpers + `
    result.leftover = fireSIsEmptyRecycleLeftoverPremises({
      id: 'aa-aa',
      organisationName: 'aa aa',
      status: 'premises',
      photos: [],
      answers: [],
      recycleBin: { currentInspections: [{ recycleId: 'r1' }] }
    });
    result.withHistory = fireSIsEmptyRecycleLeftoverPremises({
      id: 'kept',
      recycleBin: { currentInspections: [{ recycleId: 'r2' }] },
      inspectionHistory: [{ inspectionNumber: 'FS-1' }]
    });
    result.live = fireSIsEmptyRecycleLeftoverPremises({
      id: 'live',
      currentInspectionId: 'c1',
      recycleBin: { currentInspections: [{ recycleId: 'r3' }] }
    });
    result.scheduled = fireSIsEmptyRecycleLeftoverPremises({
      id: 'sched',
      scheduledStatus: 'scheduled',
      recycleBin: { currentInspections: [{ recycleId: 'r4' }] }
    });
    result.plain = fireSIsEmptyRecycleLeftoverPremises({
      id: 'plain',
      organisationName: 'Test1 Val'
    });
  `,
  { result }
);

assert.strictEqual(result.leftover, true, 'aa aa leftover empty card must hide from Gateway');
assert.strictEqual(result.withHistory, false, 'Premises with History must stay after deleting only the current inspection');
assert.strictEqual(result.live, false, 'A live current inspection must stay on Gateway');
assert.strictEqual(result.scheduled, false, 'A scheduled new premises must stay on Gateway');
assert.strictEqual(result.plain, false, 'An untouched premises card must stay on Gateway');

assert.ok(
  /function fireSIsEmptyRecycleLeftoverPremises\(project\)/.test(liveApp) &&
    /!fireSIsEmptyRecycleLeftoverPremises\(project\)/.test(liveApp) &&
    /Never bring a locally deleted premises or empty Recycle leftover back/.test(liveApp) &&
    /removeInspectionFromUploadQueue\(idToDelete\)/.test(liveApp),
  'Live must ship the same Gateway delete-hide rules as the toets-blad'
);

console.log('gateway-delete-hide.test.js: ok');
