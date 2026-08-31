'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const env = read('staging/fire-s-env.js');
const liveEnv = read('fire-s-env.js');
const liveHtml = read('index.html');
const liveApp = read('app.js');
const liveInspector = read('inspector-v4.js');
const liveTeam = read('fire-s-company-team.js');
const liveAssign = read('fire-s-schedule-assign.js');
const liveNotify = read('fire-s-subscribe-notify.js');
const app = read('staging/app.js');
const inspector = read('staging/inspector-v4.js');
const team = read('staging/fire-s-company-team.js');
const assign = read('staging/fire-s-schedule-assign.js');
const notify = read('staging/fire-s-subscribe-notify.js');
const manual = read('staging/fire-s-user-manual.js');
const liveManual = read('fire-s-user-manual.js');
const css = read('staging/styles.css');
const liveCss = read('styles.css');

assert.ok(/1\.3\.48-toets/.test(env), 'Toets-blad version must stay on 1.3.48-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.43'/.test(liveEnv) &&
    /bounceLegacyToetsQuery/.test(liveEnv),
  'Live Fire-S must be 1.3.43 and keep the old toets-link bounce'
);
assert.ok(
  !/1\.3\.23/.test(liveEnv),
  'Live environment fence must not pick up the toets version number'
);
assert.ok(
  /ispsdmglyylcwkufphnv/.test(liveEnv) &&
    /notifyCompanyS: !staging/.test(liveEnv),
  'Live must stay on fireye-sync and still invoice Company S'
);

assert.ok(
  /id="scheduleInspectorSelect"/.test(html) &&
    /Assign to inspector/.test(html) &&
    /fire-s-schedule-assign\.js/.test(html),
  'Schedule panel must let the owner pick an inspector'
);
assert.ok(
  /schedule-new-panel select/.test(css),
  'Inspector picker must be styled for a phone tap'
);

assert.ok(
  /function isMine\(p\)/.test(inspector) &&
    /assignedInspectorEmail/.test(inspector) &&
    /No inspection booked for you/.test(inspector) &&
    /projects\(\)\.slice\(\)\.filter\(isMine\)/.test(inspector),
  'Inspector Home NEXT must only show this inspector’s bookings'
);

assert.ok(
  /assignedInspectorEmail: assigned\.email/.test(app) &&
    /fireSNotifyInspectorAssignment/.test(app) &&
    /window\.saveScheduledNewInspection = saveScheduledNewInspection/.test(app) &&
    /scheduleInspectorSelect/.test(app),
  'Saving a scheduled inspection must store the assigned inspector and send them mail'
);

assert.ok(
  /window\.fireSListAssignableInspectors = listAssignableInspectors/.test(team) &&
    /lastInvites/.test(team),
  'Personnel must list inspectors (and waiting invites) for the Schedule picker'
);

assert.ok(
  /function notifyInspectorAssignment\(/.test(notify) &&
    /formsubmit\.co\/ajax\/' \+ encodeURIComponent\(email\)/.test(notify) &&
    /Fire-S: inspection booked for you/.test(notify) &&
    /root\.fireSNotifyInspectorAssignment = notifyInspectorAssignment/.test(notify),
  'Assigned inspectors must get an email with premises details'
);
assert.ok(
  /notifyCompanyS === false/.test(notify) &&
    !/notifyCompanyS === false[\s\S]{0,200}notifyInspectorAssignment/.test(
      notify.slice(notify.indexOf('function notifyInspectorAssignment'))
    ),
  'Assignment mail must still send on the toets-blad; only Company S invoices stay off'
);

assert.ok(
  /Scheduled priority<\/strong>/.test(manual) &&
    /Assign to inspector/.test(manual) &&
    /gets an email with the premises details/.test(manual),
  'User manual must explain Scheduled priority, Schedule assign, and the inspector email'
);

assert.ok(
  /id="scheduleInspectorSelect"/.test(liveHtml) &&
    /fire-s-schedule-assign\.js/.test(liveHtml) &&
    /function isMine\(p\)/.test(liveInspector) &&
    /assignedInspectorEmail: assigned\.email/.test(liveApp) &&
    /window\.fireSListAssignableInspectors = listAssignableInspectors/.test(liveTeam) &&
    /function notifyInspectorAssignment\(/.test(liveNotify) &&
    /schedule-new-panel select/.test(liveCss) &&
    /Assign to inspector/.test(liveManual),
  'Live Fire-S must have schedule-and-assign after sit dit live'
);
assert.ok(
  /Scheduled priority/.test(liveInspector) &&
    /function openList\(/.test(liveInspector) &&
    /fireSScheduledPriorityList/.test(liveAssign),
  'Live inspector Home must list open bookings under Scheduled priority'
);
assert.ok(
  /fireSIsMyInspection/.test(liveAssign),
  'Live must load the assign helper'
);

const sandbox = { window: {}, console, setTimeout: fn => fn() };
sandbox.window = sandbox;
vm.runInNewContext(assign, sandbox);
const mine = sandbox.fireSIsMyInspection;
assert.ok(typeof mine === 'function', 'fireSIsMyInspection must be exported');

const sample = { email: 'samplejdb@outlook.com', id: 'insp-1' };
assert.ok(
  mine({ createdByEmail: 'samplejdb@outlook.com', createdByUserId: 'insp-1' }, sample),
  'Unassigned work the inspector booked is theirs'
);
assert.ok(
  !mine(
    { createdByEmail: 'johandb@live.com', createdByUserId: 'owner-1' },
    sample
  ),
  'Someone else’s in-progress inspection must not be NEXT'
);
assert.ok(
  mine(
    {
      assignedInspectorEmail: 'samplejdb@outlook.com',
      assignedInspectorUserId: 'insp-1',
      createdByEmail: 'johandb@live.com'
    },
    sample
  ),
  'Work assigned to this inspector is theirs even if the owner booked it'
);
assert.ok(
  !mine(
    {
      assignedInspectorEmail: 'other@example.com',
      assignedInspectorUserId: 'other-1',
      createdByEmail: 'samplejdb@outlook.com'
    },
    sample
  ),
  'Work assigned to another person is not NEXT for this inspector'
);

vm.runInNewContext(notify, sandbox);
const body = sandbox.fireSNotifyInspectorAssignmentBuildBody({
  email: 'samplejdb@outlook.com',
  inspectorName: 'Sample Inspector',
  company: 'Company S',
  organisation: 'Test1',
  site: 'Val',
  address: '12 Church Street',
  date: '2026-08-26',
  contactName: 'Johan',
  contactTel: '0820000000',
  scheduledBy: 'johandb@live.com'
});
assert.ok(/inspection booked for you/.test(body._subject));
assert.ok(body.premises === 'Val' && body.address === '12 Church Street');
assert.ok(body.visit_date === '2026-08-26');
assert.ok(body.site_contact.indexOf('Johan') !== -1);

console.log('schedule-assign-inspectors.test.js: ok');
