'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const liveHtml = read('index.html');
const inspector = read('staging/inspector-v4.js');
const notify = read('staging/fire-s-subscribe-notify.js');
const roles = read('staging/fire-s-clean-home-roles.js');
const manual = read('staging/fire-s-user-manual.js');
const assign = read('staging/fire-s-schedule-assign.js');
const booking = read('staging/fire-s-booking-visibility.js');
const bookingCss = read('staging/fire-s-booking-visibility.css');

assert.ok(
  /fire-s-booking-visibility\.js/.test(html) &&
    /fire-s-booking-visibility\.css/.test(html) &&
    /id="scheduleInspectorSelect"/.test(html) &&
    /You see who each inspection is booked for/.test(html),
  'Toets schedule must book an inspector and load the booking list'
);
assert.ok(
  !/fire-s-booking-visibility/.test(liveHtml),
  'Live must stay as it is until sit live'
);
assert.ok(
  /No inspection booked for you yet/.test(inspector) &&
    /Finish one and it leaves this list/.test(inspector) &&
    !/Open Inspection Gateway to see company inspections/.test(inspector),
  'Inspector Home must wait for their own booking'
);
assert.ok(
  /You only see inspections booked for you/.test(notify) &&
    !/Inspection Gateway still lists company inspections/.test(notify) &&
    /Fire-S: inspection booked for you/.test(notify),
  'Assignment email must point the inspector at their own Home list'
);
assert.ok(
  /Your inspections only/.test(roles) &&
    /Home lists the inspections booked for you/.test(roles),
  'Inspector gateway copy must stay on their own inspections'
);
assert.ok(
  /body\.fire-s-role-inspector #fireSBookedOut/.test(bookingCss) &&
    /body\.fire-s-role-owner #fireSBookedOut:not\(\[hidden\]\)/.test(bookingCss) &&
    !/setProperty\('display', 'block'/.test(booking),
  'Inspector role CSS must hide the owner booking roster'
);
assert.ok(
  /Booked inspections/.test(manual) &&
    /gets an email with the premises details/.test(manual) &&
    /leaves this list/.test(manual) &&
    !/to see the company's inspections/.test(manual),
  'Manual must describe the owner roster and the inspector limit'
);

function boot(profile) {
  const sandbox = {
    console,
    setTimeout: function (fn) {
      return fn();
    },
    document: null,
    currentUserProfile: profile
  };
  sandbox.window = sandbox;
  sandbox.getVisibleProjectsForCurrentUser = function (list) {
    return list;
  };
  sandbox.getProjects = function () {
    return sandbox.__projects || [];
  };
  vm.runInNewContext(assign, sandbox);
  vm.runInNewContext(booking, sandbox);
  return sandbox;
}

const mine = { role: 'inspector', email: 'samplejdb@outlook.com', id: 'insp-1' };
const other = { role: 'inspector', email: 'other@example.com', id: 'insp-2' };
const owner = { role: 'company_owner', email: 'johandb@live.com', id: 'owner-1' };
const manager = { role: 'manager', email: 'boss@example.com', id: 'mgr-1' };

const projects = [
  {
    id: 'own-unassigned',
    organisationName: 'Cafe',
    siteName: 'Kitchen',
    scheduledDate: '2026-10-02',
    scheduledStatus: 'scheduled',
    createdByEmail: 'samplejdb@outlook.com',
    createdByUserId: 'insp-1'
  },
  {
    id: 'directed',
    organisationName: 'Shop',
    siteName: 'Floor',
    scheduledDate: '2026-10-01',
    scheduledStatus: 'scheduled',
    assignedInspectorEmail: 'samplejdb@outlook.com',
    assignedInspectorName: 'Sample Inspector',
    assignedInspectorUserId: 'insp-1',
    createdByEmail: 'johandb@live.com',
    createdByUserId: 'owner-1'
  },
  {
    id: 'other-inspector',
    organisationName: 'Warehouse',
    siteName: 'Bay',
    scheduledDate: '2026-10-03',
    scheduledStatus: 'scheduled',
    assignedInspectorEmail: 'other@example.com',
    assignedInspectorName: 'Other Inspector',
    createdByEmail: 'other@example.com',
    createdByUserId: 'insp-2'
  },
  {
    id: 'done',
    organisationName: 'Old',
    siteName: 'Site',
    scheduledDate: '2026-09-01',
    scheduledStatus: 'scheduled',
    assignedInspectorEmail: 'samplejdb@outlook.com',
    completedAt: '2026-09-02T00:00:00.000Z'
  }
];

const inspectorBox = boot(mine);
const visible = inspectorBox.fireSBookingVisibleProjects(projects, mine);
assert.deepStrictEqual(
  visible.map(project => project.id).sort(),
  ['directed', 'done', 'own-unassigned']
);
assert.ok(
  inspectorBox.fireSIsFieldInspectorForBooking(mine) &&
    !inspectorBox.fireSIsFieldInspectorForBooking(owner) &&
    !inspectorBox.fireSIsFieldInspectorForBooking(manager)
);

inspectorBox.currentUserProfile = other;
const otherVisible = inspectorBox.getVisibleProjectsForCurrentUser(projects);
assert.deepStrictEqual(
  otherVisible.map(project => project.id),
  ['other-inspector']
);

inspectorBox.currentUserProfile = manager;
const managerVisible = inspectorBox.getVisibleProjectsForCurrentUser(projects);
assert.strictEqual(managerVisible.length, projects.length);

const roster = inspectorBox.fireSBookingRoster(projects);
assert.deepStrictEqual(
  roster.map(row => row.id),
  ['directed', 'own-unassigned', 'other-inspector']
);
assert.strictEqual(roster[0].inspector, 'Sample Inspector (samplejdb@outlook.com)');
assert.ok(/created by samplejdb@outlook.com/.test(roster[1].inspector));
assert.strictEqual(roster[2].inspector, 'Other Inspector (other@example.com)');
assert.ok(!roster.some(row => row.id === 'done'));

let opened = '';
let blocked = '';
inspectorBox.alert = function (message) {
  blocked = message;
};
inspectorBox.openProject = function (id) {
  opened = id;
};
inspectorBox.currentUserProfile = mine;
inspectorBox.__projects = projects;
vm.runInNewContext(booking, inspectorBox);
inspectorBox.openProject('other-inspector');
assert.strictEqual(opened, '');
assert.ok(/another inspector/.test(blocked));
opened = '';
inspectorBox.openProject('directed');
assert.strictEqual(opened, 'directed');

console.log('booking-visibility.test.js: ok');
