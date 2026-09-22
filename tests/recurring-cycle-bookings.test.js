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
const stagingCss = read('staging/styles.css');
const stagingAssign = read('staging/fire-s-schedule-assign.js');
const stagingManual = read('staging/fire-s-user-manual.js');

assert.ok(
  /id="scheduledInspectionsBoard"/.test(stagingHtml) &&
    /Booked inspections on this site/.test(stagingHtml) &&
    /schedule-option-recurring-standout/.test(stagingHtml),
  'Toets Scheduling Centre must keep a booked-inspections board under the cycle card'
);
assert.ok(
  /Already booked — including recurring cycle/.test(stagingHtml),
  'Schedule Already booked must say recurring cycle stays listed'
);
assert.ok(
  /schedule-option-recurring-standout/.test(stagingCss) &&
    /scheduled-board-item-recurring_cycle/.test(stagingCss) &&
    /schedule-cancel-btn/.test(stagingCss),
  'Toets must style the cycle as a stand-out booking with cancel'
);
assert.ok(
  /function fireSListProjectScheduleEntries\(/.test(stagingApp) &&
    /function fireSApplyCancelScheduledInspection\(/.test(stagingApp) &&
    /function fireSHasBookedInspection\(/.test(stagingApp) &&
    /Recurring cycle bookings also appear here/.test(stagingApp),
  'Toets must list cycle bookings separately and allow cancel'
);
assert.ok(
  /hasOpenBooking\(project\)/.test(stagingAssign) &&
    /recurringCycleNextDate/.test(stagingAssign),
  'Inspector scheduled list must keep a booked cycle after the last visit'
);
assert.ok(
  /cycle stands apart/.test(stagingManual) &&
    /Cancel a future or overdue booking/.test(stagingManual),
  'User manual must say the cycle stays booked and can be cancelled'
);

function sliceFn(src, name, nextName) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  const end = src.indexOf('function ' + nextName + '(', start + 1);
  assert.ok(end > start, 'missing end ' + nextName + ' after ' + name);
  return src.slice(start, end);
}

const helperSrc = [
  sliceFn(stagingApp, 'getTodayDateString', 'normaliseDateString'),
  sliceFn(stagingApp, 'normaliseDateString', 'getProjectScheduleDate'),
  sliceFn(stagingApp, 'getProjectScheduleType', 'getProjectScheduleLabel'),
  sliceFn(stagingApp, 'addRecurringCycleToDate', 'fireSIsCycledInspection'),
  sliceFn(stagingApp, 'fireSIsCycledInspection', 'getNextRecurringCycleDate'),
  sliceFn(stagingApp, 'getNextRecurringCycleDate', 'fireSLastVisitDay'),
  sliceFn(stagingApp, 'fireSLastVisitDay', 'updateRecurringCyclePreview'),
  sliceFn(stagingApp, 'fireSIsDedicatedScheduleType', 'fireSCancelScheduledInspection')
].join('\n');

const sandbox = {
  console,
  Date,
  document: {
    getElementById() {
      return null;
    }
  }
};
vm.runInNewContext(helperSrc, sandbox);

assert.ok(typeof sandbox.fireSListProjectScheduleEntries === 'function');
assert.ok(typeof sandbox.fireSApplyCancelScheduledInspection === 'function');

const dual = {
  id: 'shop-12',
  followUpRequired: 'Yes',
  followUpDate: '2026-10-01',
  scheduledDate: '2026-10-01',
  scheduledStatus: 'scheduled',
  scheduleType: 'follow_up',
  recurringCycleEnabled: true,
  recurringCycleNumber: 6,
  recurringCycleUnit: 'months',
  recurringCycleNextDate: '2026-12-01'
};
const entries = sandbox.fireSListProjectScheduleEntries(dual);
assert.strictEqual(entries.length, 2, 'follow-up and cycle must both list, on different dates');
assert.ok(entries.some(item => item.kind === 'recurring_cycle' && item.date === '2026-12-01'));
assert.ok(entries.some(item => item.kind === 'follow_up' && item.date === '2026-10-01'));
assert.ok(sandbox.fireSHasBookedInspection(dual));

const dedicatedPlusCycle = {
  id: 'shop-20',
  scheduledDate: '2026-09-28',
  scheduledStatus: 'scheduled',
  scheduleType: 'existing_site',
  recurringCycleEnabled: true,
  recurringCycleNextDate: '2026-12-01'
};
const dedicatedEntries = sandbox.fireSListProjectScheduleEntries(dedicatedPlusCycle);
assert.strictEqual(dedicatedEntries.length, 2, 'dedicated booking and cycle must both stay visible');

const cancelled = sandbox.fireSApplyCancelScheduledInspection(dual, 'recurring_cycle');
assert.strictEqual(cancelled.recurringCycleOccurrenceCancelled, true);
assert.ok(!sandbox.fireSGetRecurringCycleBookedDate(cancelled));
const afterCancel = sandbox.fireSListProjectScheduleEntries(cancelled);
assert.ok(
  afterCancel.every(item => item.kind !== 'recurring_cycle'),
  'cancelled cycle inspection must leave the booked list'
);
assert.ok(
  afterCancel.some(item => item.kind === 'follow_up'),
  'cancelling the cycle must keep the corrective follow-up'
);

const overdueCycle = {
  id: 'overdue',
  recurringCycleEnabled: true,
  recurringCycleNextDate: '2026-01-01',
  scheduleType: 'recurring_cycle',
  scheduledDate: '2026-01-01',
  scheduledStatus: 'scheduled',
  completedAt: '2025-12-01T08:00:00.000Z'
};
assert.ok(sandbox.fireSHasBookedInspection(overdueCycle));
const skipped = sandbox.fireSApplyCancelScheduledInspection(overdueCycle, 'recurring_cycle');
assert.strictEqual(skipped.recurringCycleOccurrenceCancelled, true);
assert.ok(!sandbox.fireSHasBookedInspection(skipped));

const stamped = sandbox.fireSStampRecurringCycleSchedule(
  { inspectionDate: '2026-09-01' },
  true,
  6,
  'months',
  'Routine 6-monthly'
);
assert.ok(stamped.recurringCycleNextDate, 'saving an active cycle must book the next cycle date');
assert.strictEqual(stamped.scheduleType, 'recurring_cycle');

console.log('recurring-cycle-bookings.test.js: ok');
