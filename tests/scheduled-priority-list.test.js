'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const inspector = read('staging/inspector-v4.js');
const css = read('staging/inspector-v4.css');
const env = read('staging/fire-s-env.js');
const liveEnv = read('fire-s-env.js');
const assign = read('staging/fire-s-schedule-assign.js');
const manual = read('staging/fire-s-user-manual.js');

assert.ok(/1\.3\.118-toets/.test(env), 'Toets-blad version must stay on 1.3.118-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.67'/.test(liveEnv),
  'Live Fire-S must be 1.3.67 after sit dit live'
);
assert.ok(
  /Scheduled priority/.test(read('inspector-v4.js')) &&
    /function openList\(/.test(read('inspector-v4.js')) &&
    /function bindCards\(/.test(read('inspector-v4.js')) &&
    !/const open=openList\(/.test(read('inspector-v4.js')) &&
    /inspector-v4\.js\?v=4-10-live-open/.test(read('index.html')),
  'Live Scheduled priority CONTINUE must open the inspection'
);

assert.ok(
  /Scheduled priority/.test(inspector) &&
    /function openList\(/.test(inspector) &&
    /fireSScheduledPriorityList/.test(inspector) &&
    /inspector-v4-list/.test(inspector) &&
    /Finish one and it leaves this list/.test(inspector),
  'Inspector Home must list open bookings under Scheduled priority'
);
assert.ok(
  /inspector-v4-list/.test(css),
  'The scheduled list must stack as a phone-friendly column'
);
assert.ok(
  /Scheduled priority/.test(manual) &&
    /leaves this list/.test(manual),
  'User manual must say the list drops a finalised inspection'
);

const sandbox = { window: {}, console, setTimeout: fn => fn() };
sandbox.window = sandbox;
vm.runInNewContext(assign, sandbox);

const sample = { email: 'samplejdb@outlook.com', id: 'insp-1' };
const list = sandbox.fireSScheduledPriorityList(
  [
    {
      id: 'later',
      projectName: 'Shop 20',
      scheduledDate: '2026-09-10',
      assignedInspectorEmail: 'samplejdb@outlook.com'
    },
    {
      id: 'done',
      projectName: 'Done site',
      scheduledDate: '2026-08-01',
      assignedInspectorEmail: 'samplejdb@outlook.com',
      completedAt: '2026-08-20T10:00:00.000Z'
    },
    {
      id: 'soon',
      projectName: 'Shop 12',
      scheduledDate: '2026-08-26',
      assignedInspectorEmail: 'samplejdb@outlook.com'
    },
    {
      id: 'other',
      projectName: 'Test1 Val',
      scheduledDate: '2026-08-02',
      createdByEmail: 'johandb@live.com'
    }
  ],
  sample
);

assert.ok(list.length === 2, 'List must keep two open bookings and drop the finalised one');
assert.ok(list[0].id === 'soon' && list[1].id === 'later', 'Soonest scheduled date is first (scheduled priority)');
assert.ok(
  !list.some(item => item.id === 'done' || item.id === 'other'),
  'Finalised work and someone else’s booking must leave the inspector list'
);
assert.ok(
  sandbox.fireSIsFinalizedInspection({ completedAt: '2026-08-20' }) &&
    sandbox.fireSIsFinalizedInspection({ finalisedAt: '2026-08-20' }) &&
    !sandbox.fireSIsFinalizedInspection({ scheduledDate: '2026-08-26' }),
  'Finalised means completed or finalised, not merely scheduled'
);
assert.ok(
  !/const open=openList\(/.test(inspector) &&
    /const bookings=openList\(all\)/.test(inspector) &&
    /function bindCards\(/.test(inspector) &&
    /inspector-v4\.js\?v=4-10-open-card/.test(read('staging/index.html')),
  'CONTINUE must call the open function, not the booking list'
);

const opened = [];
const cardDoc = {
  body: { dataset: { fireSCleanHomeRole: 'inspector' }, classList: { contains() { return false; }, add() {}, remove() {} } },
  addEventListener() {},
  createElement() { return { id: '', className: '', style: { setProperty() {} }, innerHTML: '', appendChild() {}, querySelector() { return null; }, setAttribute() {}, removeAttribute() {} }; },
  getElementById() { return null; },
  querySelectorAll() { return []; }
};
const cards = [];
cardDoc.querySelectorAll = function (sel) {
  if (sel === '[data-v4-open]') return cards;
  return [];
};
const clickUi = {
  window: {},
  document: cardDoc,
  console,
  setTimeout(fn) { return fn(); },
  currentUserProfile: { role: 'inspector', email: 'insp@example.com', id: 'insp-1' },
  getProjects() {
    return [{ id: 'soon', projectName: 'Shop 12', scheduledDate: '2026-08-26', assignedInspectorEmail: 'insp@example.com' }];
  },
  getVisibleProjectsForCurrentUser(list) { return list; },
  openProject(id) { opened.push(id); }
};
clickUi.window = clickUi;
clickUi.document.body.classList = cardDoc.body.classList;
vm.runInNewContext(inspector, clickUi);
cards.push({
  dataset: { v4Open: 'soon' },
  onclick: null
});
clickUi.document.querySelectorAll = sel => (sel === '[data-v4-open]' ? cards : []);
const centre = {
  id: 'mainCommandCentre',
  appendChild() {},
  style: { setProperty() {} }
};
const shellBits = {};
clickUi.document.getElementById = function (id) {
  if (id === 'mainCommandCentre') return centre;
  if (id === 'inspectorV4Shell') return shellBits.shell || null;
  if (id === 'inspectorV4Search') return { value: '', addEventListener() {} };
  if (id === 'inspectorV4Next') return shellBits.next;
  if (id === 'inspectorV4Results') return shellBits.results;
  return null;
};
shellBits.next = { innerHTML: '' };
shellBits.results = { innerHTML: '' };
shellBits.shell = {
  id: 'inspectorV4Shell',
  style: { setProperty() {} },
  setAttribute() {},
  removeAttribute() {},
  querySelector(sel) {
    if (sel === '.inspector-v4-hint') return { textContent: '' };
    if (sel === '#inspectorV4Gateway') return {};
    if (sel === '#inspectorV4Search') return { value: '', addEventListener() {} };
    return null;
  },
  appendChild() {}
};
clickUi.fireSInspectorV4();
assert.ok(typeof cards[0].onclick === 'function', 'Scheduled priority card must have a click handler');
cards[0].onclick({ preventDefault() {} });
assert.deepStrictEqual(opened, ['soon'], 'CONTINUE opens that inspection');

console.log('scheduled-priority-list.test.js: ok');
