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

assert.ok(/1\.3\.54-toets/.test(env), 'Toets-blad version must stay on 1.3.54-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.48'/.test(liveEnv),
  'Live Fire-S must be 1.3.48 after sit dit live'
);
assert.ok(
  /Scheduled priority/.test(read('inspector-v4.js')) &&
    /function openList\(/.test(read('inspector-v4.js')),
  'Live inspector Home must show the Scheduled priority list'
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

console.log('scheduled-priority-list.test.js: ok');
