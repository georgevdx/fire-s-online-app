'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const liveAssign = read('fire-s-schedule-assign.js');
const stagingAssign = read('staging/fire-s-schedule-assign.js');
const liveCss = read('styles.css');
const stagingCss = read('staging/styles.css');
const liveManual = read('fire-s-user-manual.js');
const stagingManual = read('staging/fire-s-user-manual.js');
const liveEnv = read('fire-s-env.js');
const stagingEnv = read('staging/fire-s-env.js');

assert.ok(/1\.3\.66-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.66-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.59'/.test(liveEnv),
  'Live Fire-S must be 1.3.59'
);

function assertExistingScheduleUi(html, css, app, assign, manual, label) {
  assert.ok(
    /id="scheduleExistingInspectionBtn"/.test(html) &&
      /Schedule Inspection for Existing Site/.test(html) &&
      /id="scheduleExistingPremisesSelect"/.test(html) &&
      /id="scheduleModeExistingBtn"/.test(html) &&
      /id="scheduleNewSiteFields"/.test(html),
    label + ' must have an existing-site schedule picker on the Gateway'
  );
  assert.ok(
    /schedule-mode-btn/.test(css) && /schedule-existing-summary/.test(css),
    label + ' must style the existing/new site tabs'
  );
  assert.ok(
    /function saveScheduledExistingInspection\(/.test(app) &&
      /function listSchedulablePremises\(/.test(app) &&
      /schedulePanelMode === 'existing'/.test(app) &&
      /fireSStampExistingSiteSchedule/.test(app) &&
      /type === 'existing_site'/.test(app),
    label + ' must save onto the existing premises instead of opening a new inspection'
  );
  assert.ok(
    /function stampExistingSiteSchedule\(/.test(assign) &&
      /function canBookExistingPremises\(/.test(assign) &&
      /function uniqueSchedulablePremises\(/.test(assign) &&
      /scheduleType = 'existing_site'/.test(assign),
    label + ' must stamp an existing-site booking without creating a duplicate card'
  );
  assert.ok(
    /existing site/.test(manual) &&
      /do not have to open a new inspection form first/.test(manual),
    label + ' user manual must say existing sites can be booked without opening a new inspection'
  );
}

assertExistingScheduleUi(liveHtml, liveCss, liveApp, liveAssign, liveManual, 'Live');
assert.ok(
  /id="appVersion" class="brand-version">Version 1\.3\.59</.test(liveHtml) &&
    /id="cloudVersion">1\.3\.59</.test(liveHtml),
  'Live must show Version 1.3.59 in the header without waiting for a script'
);
assert.ok(
  /id="appVersion" class="brand-version">Version 1\.3\.66-toets</.test(stagingHtml) &&
    /id="cloudVersion">1\.3\.66-toets</.test(stagingHtml),
  'Toets-blad must show Version 1.3.66-toets in the header without waiting for a script'
);
assertExistingScheduleUi(
  stagingHtml,
  stagingCss,
  stagingApp,
  stagingAssign,
  stagingManual,
  'Toets-blad'
);

const sandbox = { window: {}, console, setTimeout: fn => fn() };
sandbox.window = sandbox;
vm.runInNewContext(liveAssign, sandbox);

const unique = sandbox.fireSUniqueSchedulablePremises([
  {
    id: 'old',
    organisationName: 'ABC Stores',
    siteName: 'Shop 12',
    lastSaved: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'latest',
    organisationName: 'ABC Stores',
    siteName: 'Shop 12',
    addressLine: '12 Church Street',
    lastSaved: '2026-08-01T00:00:00.000Z'
  },
  {
    id: 'other',
    organisationName: 'XYZ Mall',
    siteName: 'Unit 4',
    lastSaved: '2026-07-01T00:00:00.000Z'
  }
]);
assert.strictEqual(unique.length, 2, 'Duplicate name+site cards must collapse to one premises');
assert.ok(
  unique.some(item => item.id === 'latest'),
  'The latest card for a premises must be the one that can be booked'
);

const completed = {
  id: 'done',
  organisationName: 'ABC Stores',
  siteName: 'Shop 12',
  completedAt: '2026-08-20T10:00:00.000Z',
  answers: [{ answer: 'Yes' }],
  scheduledStatus: 'completed'
};
const completedGate = sandbox.fireSCanBookExistingPremises(completed);
assert.ok(completedGate.ok === true && completedGate.alreadyBooked === false);

const inProgress = {
  id: 'open',
  organisationName: 'ABC Stores',
  siteName: 'Shop 12',
  answers: [{ answer: 'No' }],
  scheduledStatus: 'in_progress'
};
const blocked = sandbox.fireSCanBookExistingPremises(inProgress);
assert.ok(blocked.ok === false && blocked.reason === 'in_progress');

const stamped = sandbox.fireSStampExistingSiteSchedule(completed, {
  date: '2026-09-20',
  inspectionType: 'General Fire Inspection',
  assigned: {
    email: 'samplejdb@outlook.com',
    name: 'Sample Inspector',
    userId: 'insp-1'
  }
});
assert.strictEqual(stamped.id, 'done', 'Booking must keep the existing premises id');
assert.strictEqual(stamped.scheduleType, 'existing_site');
assert.strictEqual(stamped.scheduledStatus, 'scheduled');
assert.strictEqual(stamped.scheduledDate, '2026-09-20');
assert.strictEqual(stamped.completedAt, null);
assert.strictEqual(stamped.scheduleFreshInspection, true);
assert.strictEqual(stamped.assignedInspectorEmail, 'samplejdb@outlook.com');
assert.ok(
  Array.isArray(stamped.answers) && stamped.answers.length === 1,
  'Previous answers stay on the card until the scheduled inspection is opened'
);

console.log('schedule-existing-site.test.js: ok');
