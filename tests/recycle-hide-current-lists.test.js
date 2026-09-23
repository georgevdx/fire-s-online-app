'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const stagingApp = read('staging/app.js');
const stagingHtml = read('staging/index.html');
const stagingLists = read('staging/fire-s-owner-lists.js');

assert.ok(
  /Version 1\.3\.112-toets/.test(stagingHtml) &&
    /app\.js\?v=1-3-112-feedback/.test(stagingHtml) &&
    /fire-s-owner-lists\.js\?v=1-10-last-def/.test(stagingHtml),
  'Toets must cache-bust Recycle-hide Home lists as 1.3.112-toets'
);
assert.ok(
  /function fireSIsHiddenFromCurrentLists\(project\)/.test(stagingApp) &&
    /function fireSLiveInspectionMatchesRecycledCurrent\(project\)/.test(stagingApp) &&
    /window\.fireSIsHiddenFromCurrentLists = fireSIsHiddenFromCurrentLists/.test(stagingApp),
  'Toets must hide Recycle Bin premises from current lists'
);
assert.ok(
  /If the cloud already has the Recycle\/deleted stamp/.test(stagingApp) &&
    /cloudDeleted/.test(stagingApp),
  'Cloud merge must keep a Recycle/deleted stamp instead of restoring a live building'
);
assert.ok(
  /fireSIsHiddenFromCurrentLists/.test(stagingLists),
  'Owner Home lists must use the shared Recycle-hide helper'
);

const helperStart = stagingApp.indexOf('function fireSHasRecycledCurrentInspection');
const helperEnd = stagingApp.indexOf('function fireSIsInspectionOverdue');
assert.ok(helperStart > 0 && helperEnd > helperStart, 'Recycle helpers must sit together');

const hidden = { value: null };
vm.runInNewContext(
  stagingApp.slice(helperStart, helperEnd) + `
    hidden.value = fireSIsHiddenFromCurrentLists({
      id: 'bin',
      deletedAt: '2026-09-01',
      deleteType: 'entire_premises',
      organisationName: 'Saverite Supermarket'
    });
  `,
  {
    hidden,
    fireSIsDeletedPremises(project) {
      return !!(project && (project.deletedAt || project.deleteType === 'entire_premises'));
    }
  }
);
assert.strictEqual(hidden.value, true, 'Entire premises in Recycle must hide from current lists');

const qStart = stagingApp.indexOf('function fireSCloudRowInspectionId');
const qEnd = stagingApp.indexOf('function fireSIsLocalProfileFallback');
const queued = [];
const queueSandbox = {
  currentUserProfile: { companyId: 'co-1' },
  fireSIsDeletedPremises(project) {
    return !!(project && project.deletedAt);
  },
  fireSIsHiddenFromCurrentLists(project) {
    return !!(project && (project.deletedAt || project.recycleBin));
  },
  queueInspectionForUpload(id) {
    queued.push(String(id));
  }
};
vm.runInNewContext(stagingApp.slice(qStart, qEnd), queueSandbox);
const queuedCount = queueSandbox.queueLocalPremisesMissingFromCloud(
  [
    { id: 'live-1', companyId: 'co-1' },
    { id: 'bin-1', companyId: 'co-1', deletedAt: '2026-09-01' },
    {
      id: 'leftover-1',
      companyId: 'co-1',
      recycleBin: { currentInspections: [{ recycleId: 'r1' }] }
    }
  ],
  [{ id: 'live-1', company_id: 'co-1' }]
);
assert.strictEqual(queuedCount, 1, 'Recycle leftovers must not re-queue as live buildings');
assert.deepStrictEqual(queued, ['bin-1']);

const listSandbox = {
  document: { readyState: 'complete', getElementById() { return null; }, addEventListener() {} },
  setTimeout() {},
  fireSIsHiddenFromCurrentLists(project) {
    return !!(project && (project.deletedAt || (
      project.recycleBin &&
      project.recycleBin.currentInspections &&
      project.recycleBin.currentInspections.length &&
      project.inspectionNumber === 'FS-9'
    )));
  }
};
vm.runInNewContext(stagingLists, listSandbox);
const model = listSandbox.fireSBuildOwnerListModel([
  { id: 'live', organisationName: 'Plastic view', completedAt: '2026-07-27' },
  {
    id: 'bin',
    organisationName: 'Gone Saverite',
    deletedAt: '2026-09-01',
    deleteType: 'entire_premises',
    completedAt: '2026-08-20'
  },
  {
    id: 'recycle-live',
    organisationName: 'Tester 1',
    inspectionNumber: 'FS-9',
    completedAt: '2026-08-01',
    recycleBin: { currentInspections: [{ inspectionLabel: 'FS-9' }] }
  }
], '2026-09-16');
assert.deepStrictEqual(
  model.all.map(row => row.id),
  ['live'],
  'Home building list must drop Recycle Bin premises'
);
assert.equal(model.count, 1);

console.log('recycle-hide-current-lists.test.js: ok');
