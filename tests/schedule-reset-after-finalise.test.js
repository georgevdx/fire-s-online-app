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
const liveApp = read('app.js');
const liveHtml = read('index.html');

assert.ok(
  /function fireSApplyScheduleAfterVisit\(/.test(stagingApp) &&
    /function fireSIsCycledInspection\(/.test(stagingApp),
  'Toets must reset schedule after a visit unless the premises is cycled'
);
assert.ok(
  /const scheduledProject = fireSApplyScheduleAfterVisit\(/.test(stagingApp),
  'Finish Inspection must apply schedule-after-visit'
);
assert.ok(
  /persistFinalisedLifecycle[\s\S]*fireSApplyScheduleAfterVisit\(row/.test(stagingApp),
  'Finalise must apply schedule-after-visit'
);
assert.ok(
  /createFireSCleanInspectionWorkspace[\s\S]*fireSApplyScheduleAfterVisit\(cleaned, lastVisit\)/.test(stagingApp),
  'A new inspection workspace must not keep a spent booking date'
);
assert.ok(
  /Keep premises recurring-cycle listing/.test(stagingApp),
  'New inspection workspace must keep the premises cycle listing'
);
assert.ok(
  /list\.map\(project => fireSApplyScheduleAfterVisit\(project\)\)/.test(stagingApp),
  'Loaded inspections must drop leftover overdue dates after a visit'
);
assert.ok(
  !/if \(fireSIsInspectionClosed\(project\)\) return false;/.test(
    stagingApp.slice(stagingApp.indexOf('function fireSIsInspectionOverdue'))
  ),
  'Overdue must still show the next cycle date after the previous inspection is closed'
);
assert.ok(
  /app\.js\?v=1-3-79-toets-comment/.test(stagingHtml),
  'Toets must cache-bust schedule reset after finalise'
);
assert.ok(
  /Version 1\.3\.79-toets/.test(stagingHtml),
  'Displayed toets version stays 1.3.79-toets'
);
assert.ok(
  /function fireSApplyScheduleAfterVisit\(/.test(liveApp) &&
    /persistFinalisedLifecycle[\s\S]*fireSApplyScheduleAfterVisit\(row/.test(liveApp) &&
    /list\.map\(project => fireSApplyScheduleAfterVisit\(project\)\)/.test(liveApp) &&
    /app\.js\?v=1-3-65-comment/.test(liveHtml) &&
    /Version 1\.3\.65/.test(liveHtml),
  'Live must reset schedule after finalise without bumping 1.3.65'
);

function sliceFn(src, name, nextName) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  const end = src.indexOf('function ' + nextName + '(', start + 1);
  assert.ok(end > start, 'missing end ' + nextName + ' after ' + name);
  return src.slice(start, end);
}

const helperSrc = [
  sliceFn(stagingApp, 'normaliseDateString', 'getProjectScheduleDate'),
  sliceFn(stagingApp, 'addRecurringCycleToDate', 'fireSIsCycledInspection'),
  sliceFn(stagingApp, 'fireSIsCycledInspection', 'getNextRecurringCycleDate'),
  sliceFn(stagingApp, 'getNextRecurringCycleDate', 'fireSLastVisitDay'),
  sliceFn(stagingApp, 'fireSLastVisitDay', 'updateRecurringCyclePreview')
].join('\n');

const sandbox = { console };
vm.runInNewContext(helperSrc, sandbox);

const apply = sandbox.fireSApplyScheduleAfterVisit;
assert.ok(typeof apply === 'function', 'helper must load');

const leftover = apply({
  scheduledDate: '2026-08-01',
  scheduledStatus: 'scheduled',
  scheduleType: 'existing_site',
  completedAt: '2026-09-10T10:00:00.000Z',
  inspectionLifecycleStatus: 'finalised',
  archiveStatus: 'completed'
});
assert.strictEqual(leftover.scheduledDate, '', 'finalised one-off must reset schedule to none');
assert.strictEqual(leftover.scheduledStatus, 'completed');

const cycled = apply(
  {
    scheduledDate: '2026-08-01',
    scheduledStatus: 'scheduled',
    scheduleType: 'recurring_cycle',
    recurringCycleEnabled: true,
    recurringCycleNumber: 6,
    recurringCycleUnit: 'months'
  },
  '2026-09-14T08:00:00.000Z'
);
assert.ok(cycled.scheduledDate > '2026-09-14', 'cycled inspection must move to the next cycle date');
assert.strictEqual(cycled.scheduleType, 'recurring_cycle');
assert.strictEqual(cycled.scheduledStatus, 'scheduled');

const stillDue = apply({
  scheduledDate: '2026-08-01',
  scheduledStatus: 'scheduled',
  scheduleType: 'existing_site'
});
assert.strictEqual(stillDue.scheduledDate, '2026-08-01', 'unvisited booking must stay overdue');

const newWorkspace = apply(
  {
    scheduledDate: '2026-08-01',
    scheduledStatus: 'created',
    inspectionLifecycleStatus: 'created',
    completedAt: null,
    inspectionHistory: [{ completedAt: '2026-09-10T10:00:00.000Z' }]
  },
  '2026-09-10T10:00:00.000Z'
);
assert.strictEqual(newWorkspace.scheduledDate, '', 'new workspace must not keep the spent booking');

const followUp = apply({
  scheduledDate: '2026-08-01',
  scheduledStatus: 'scheduled',
  followUpRequired: 'Yes',
  followUpDate: '2026-10-01',
  completedAt: '2026-09-14T08:00:00.000Z'
});
assert.strictEqual(followUp.scheduledDate, '2026-10-01', 'open follow-up after finish stays scheduled');
assert.strictEqual(followUp.scheduleType, 'follow_up');

console.log('schedule-reset-after-finalise.test.js: ok');
