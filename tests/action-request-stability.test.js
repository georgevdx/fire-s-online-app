'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function loadStability() {
  const context = {
    console,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Math,
    Map,
    SetTimeout: null
  };
  context.window = context;
  vm.runInNewContext(read('staging/action-request-stability.js'), context);
  return context.FireSActionRequestStability;
}

const api = loadStability();
const project = {
  id: 'premises-1',
  inspectionNumber: 'INSP-9',
  currentInspectionId: 'cycle-1',
  inspectorName: 'Ada'
};

function noItem(overrides) {
  return Object.assign({
    itemIndex: 2,
    itemNumber: '3',
    question: 'Fire extinguisher serviced',
    finding: 'Extinguisher is out of date',
    sectionName: 'Fire Equipment',
    correctiveAction: 'Service the extinguisher',
    reference: 'SANS',
    priority: 'Critical',
    responsible: 'Approved Contractor',
    dueDate: '2026-10-13'
  }, overrides);
}

const created = api.absorb(project, [], [noItem()], function () { return 'AC-2026-000001'; });
assert.strictEqual(created.length, 1, 'a NO answer creates one action');
assert.strictEqual(created[0].status, 'Open');
assert.strictEqual(created[0].actionId, 'AC-2026-000001');
assert.strictEqual(created[0].itemIndex, 2);

const saved = Object.assign({}, created[0], {
  dueDate: '2026-01-15',
  responsible: 'Site Owner',
  priority: 'High'
});
const refreshed = api.absorb(project, [saved], [noItem({ dueDate: '2026-12-01', responsible: 'Someone Else', priority: 'Low' })], function () {
  throw new Error('refresh must not mint a second action');
});
assert.strictEqual(refreshed.length, 1, 'refresh keeps a single action');
assert.strictEqual(refreshed[0].dueDate, '2026-01-15', 'refresh must keep the saved due date');
assert.strictEqual(refreshed[0].responsible, 'Site Owner');
assert.strictEqual(refreshed[0].priority, 'High');
assert.strictEqual(refreshed[0].actionId, 'AC-2026-000001');
assert.deepStrictEqual(api.absorb(project, refreshed, [noItem()], function () {
  throw new Error('stable refresh must not mint an action');
}), refreshed, 'a second refresh must not change the action');

const resolved = Object.assign({}, refreshed[0], {
  status: 'Closed',
  closeComment: 'Serviced and tagged',
  closedBy: 'Ada',
  closedDate: '2026-09-01',
  history: (refreshed[0].history || []).concat([{ event: 'Resolved', date: '2026-09-01', note: 'Serviced and tagged' }])
});
const reopenAttempt = Object.assign({}, resolved, {
  status: 'Open',
  closedDate: '',
  closeComment: '',
  history: (resolved.history || []).concat([{ event: 'Reopened', date: '2026-09-02', note: 'Checklist answer is NO.' }])
});
const keptClosed = api.absorbPair(project, [resolved], [reopenAttempt], [noItem()]);
assert.strictEqual(keptClosed.length, 1);
assert.strictEqual(keptClosed[0].status, 'Closed', 'an automatic reopen must not undo Resolve');
assert.strictEqual(keptClosed[0].closeComment, 'Serviced and tagged');
assert.strictEqual(keptClosed[0].dueDate, '2026-01-15');

const openedByInspector = Object.assign({}, resolved, {
  status: 'Open',
  closeComment: 'Needs another visit',
  history: (resolved.history || []).concat([{ event: 'Updated', date: '2026-09-03', note: 'Needs another visit' }])
});
const reopened = api.absorbPair(project, [resolved], [openedByInspector], [noItem()]);
assert.strictEqual(reopened[0].status, 'Open', 'the inspector can open a resolved action again');
assert.strictEqual(reopened[0].closeComment, 'Needs another visit');

const cleared = api.absorb(project, keptClosed, [], function () {
  throw new Error('Yes must not create an action');
});
assert.strictEqual(cleared.length, 0, 'changing the answer away from NO removes the generated action');

const again = api.absorb(project, cleared, [noItem()], function () { return 'AC-2026-000002'; });
assert.strictEqual(again.length, 1);
assert.strictEqual(again[0].status, 'Open', 'a later NO starts a new open action');
assert.strictEqual(again[0].actionId, 'AC-2026-000002');

const legacy = {
  actionId: 'ACT-0003',
  actionKey: 'premises-1|cycle-1|3|fire extinguisher serviced',
  itemIndex: 2,
  itemNumber: '3',
  question: 'Fire extinguisher serviced',
  status: 'Open',
  dueDate: '2026-02-02',
  responsible: 'Owner',
  priority: 'High',
  source: 'NO answer',
  history: [{ event: 'Created', date: '2026-02-01', note: 'Created' }]
};
const otherKey = Object.assign({}, legacy, {
  actionId: 'AC-2026-000099',
  actionKey: 'premises-1|2|3|fire extinguisher serviced',
  dueDate: '2026-11-11'
});
const collapsed = api.absorb(project, [legacy, otherKey], [noItem()], function () {
  throw new Error('duplicates must collapse without a new id');
});
assert.strictEqual(collapsed.length, 1, 'different action keys for one checklist item collapse');
assert.strictEqual(collapsed[0].dueDate, '2026-02-02', 'the first saved due date survives a duplicate key');
assert.strictEqual(collapsed[0].actionKey, 'premises-1|2|3|fire extinguisher serviced');

const manual = {
  actionId: 'MANUAL-1',
  question: 'Follow up with the landlord',
  status: 'Open',
  dueDate: '2026-04-01',
  manual: true
};
const withManual = api.absorb(project, [manual, saved], [], function () { return 'SHOULD-NOT'; });
assert.strictEqual(withManual.length, 1, 'a manual action stays when the checklist NO is cleared');
assert.strictEqual(withManual[0].actionId, 'MANUAL-1');

const filled = {
  id: 'premises-1',
  inspectionNumber: 'INSP-9',
  currentInspectionId: 'cycle-1',
  answers: [
    { itemIndex: 0, answer: 'Yes', question: 'Alarm tested' },
    { itemIndex: 1, answer: 'No', question: 'Escape route clear' }
  ]
};
const wiped = api.stabiliseProject(filled, Object.assign({}, filled, { answers: [], actions: [] }));
assert.strictEqual(wiped.answers.length, 2, 'an empty checklist snapshot must not wipe saved answers');
assert.strictEqual(wiped.answers[1].answer, 'No');

const blank = api.stabiliseProject(filled, Object.assign({}, filled, {
  answers: [
    { itemIndex: 0, answer: '' },
    { itemIndex: 1, answer: '' }
  ]
}));
assert.strictEqual(blank.answers[0].answer, 'Yes', 'a blank checklist must not replace filled answers');
assert.strictEqual(blank.answers[1].answer, 'No');

const partial = api.stabiliseProject(filled, Object.assign({}, filled, {
  answers: [{ itemIndex: 1, answer: 'Yes', question: 'Escape route clear' }]
}));
assert.strictEqual(partial.answers.length, 2, 'a partial snapshot keeps the answers that were not on screen');
assert.strictEqual(partial.answers[0].answer, 'Yes');
assert.strictEqual(partial.answers.find(answer => answer.itemIndex === 1).answer, 'Yes');

const nextCycle = api.stabiliseProject(filled, Object.assign({}, filled, {
  inspectionNumber: 'INSP-10',
  currentInspectionId: 'cycle-2',
  answers: [],
  actions: []
}));
assert.deepStrictEqual(nextCycle.answers, [], 'a new inspection cycle may start with an empty checklist');

const storedAction = Object.assign({}, saved, {
  itemIndex: 1,
  itemNumber: '2',
  question: 'Escape route clear',
  actionKey: 'premises-1|1|2|escape route clear',
  status: 'Closed',
  closeComment: 'Done',
  history: [{ event: 'Created', date: '2026-01-01' }, { event: 'Resolved', date: '2026-01-02' }]
});
const engineWrite = api.stabiliseProject(
  Object.assign({}, filled, { actions: [storedAction] }),
  Object.assign({}, filled, {
    answers: filled.answers,
    actions: [Object.assign({}, storedAction, {
      actionKey: 'premises-1|cycle-1|2|escape route clear',
      status: 'Open',
      dueDate: '2026-12-31',
      closeComment: '',
      history: storedAction.history.concat([{ event: 'Reopened', date: '2026-09-02' }])
    }), Object.assign({}, storedAction, { actionId: 'ACT-0099', actionKey: 'other|key' })]
  })
);
assert.strictEqual(engineWrite.actions.length, 1, 'two generated keys for one NO item become one action');
assert.strictEqual(engineWrite.actions[0].status, 'Closed');
assert.strictEqual(engineWrite.actions[0].dueDate, '2026-01-15');

function browserContext() {
  const store = {};
  const projects = [];
  const context = {
    console,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Math,
    Map,
    Set,
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); }
    },
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    setTimeout() { return 0; },
    setInterval() { return 0; },
    clearTimeout() {},
    clearInterval() {},
    currentProjectId: 'premises-1',
    currentProject: null,
    getProjects() { return projects.map(project => Object.assign({}, project)); },
    setProjects(list) { projects.splice(0, projects.length, ...list); }
  };
  context.window = context;
  return { context, projects, store };
}

function loadScripts(context, names) {
  names.forEach(name => vm.runInNewContext(read(name), context, { filename: name }));
}

const hard = browserContext();
hard.projects.push({
  id: 'premises-1',
  inspectionNumber: 'INSP-9',
  currentInspectionId: 'cycle-1',
  inspectorName: 'Ada',
  answers: [{ itemIndex: 2, itemNumber: '3', answer: 'No', question: 'Fire extinguisher serviced', note: 'Out of date' }],
  actions: []
});
loadScripts(hard.context, [
  'staging/action-request-stability.js',
  'staging/action-register-hard-fix.js'
]);
const first = hard.context.FireSActionRegisterHardFix.syncActionsToProject();
assert.strictEqual(first.actions.length, 1, 'hard fix creates the NO action');
assert.strictEqual(first.actions[0].status, 'Open');
first.actions[0].dueDate = '2026-03-03';
first.actions[0].responsible = 'Building Owner';
first.actions[0].status = 'Closed';
first.actions[0].closeComment = 'Tagged';
first.actions[0].history = (first.actions[0].history || []).concat([{ event: 'Resolved', date: '2026-03-04', note: 'Tagged' }]);
hard.projects[0] = first;
const second = hard.context.FireSActionRegisterHardFix.syncActionsToProject();
assert.strictEqual(second.actions.length, 1);
assert.strictEqual(second.actions[0].status, 'Closed', 'hard fix must leave a resolved action closed');
assert.strictEqual(second.actions[0].dueDate, '2026-03-03', 'hard fix must not reset the due date');
assert.strictEqual(second.actions[0].responsible, 'Building Owner');
const third = hard.context.FireSActionRegisterHardFix.syncActionsToProject();
assert.strictEqual(third.lastSaved, second.lastSaved, 'hard fix must stop writing once the action is stable');
assert.deepStrictEqual(third.actions, second.actions);

hard.projects[0] = Object.assign({}, second, {
  answers: [{ itemIndex: 2, itemNumber: '3', answer: 'Yes', question: 'Fire extinguisher serviced' }]
});
const afterYes = hard.context.FireSActionRegisterHardFix.syncActionsToProject();
assert.strictEqual(afterYes.actions.length, 0, 'hard fix removes the action when the answer is no longer NO');

const sync = browserContext();
sync.projects.push({
  id: 'premises-1',
  inspectionNumber: 'INSP-9',
  answers: [{ itemIndex: 4, itemNumber: '5', answer: 'No', question: 'Escape route clear' }],
  actions: [{
    actionId: 'AC-2026-000010',
    actionKey: 'old|different|key',
    itemIndex: 4,
    itemNumber: '5',
    question: 'Escape route clear',
    status: 'Open',
    dueDate: '2026-05-05',
    responsible: 'Owner',
    priority: 'Critical',
    source: 'NO answer',
    history: [{ event: 'Created', date: '2026-05-01' }]
  }]
});
loadScripts(sync.context, [
  'staging/action-request-stability.js',
  'staging/action-sync-fix.js'
]);
const synced = sync.context.FireSActionSyncFix.syncProject(sync.projects[0]);
assert.strictEqual(synced.actions.length, 1, 'sync fix must not add a second action for a legacy key');
assert.strictEqual(synced.actions[0].dueDate, '2026-05-05');
assert.strictEqual(synced.actions[0].actionId, 'AC-2026-000010');
const syncedAgain = sync.context.FireSActionSyncFix.syncProject(synced);
assert.strictEqual(syncedAgain, synced, 'sync fix must leave a stable action untouched');

const engine = {
  console,
  localStorage: {
    getItem() { throw new Error('storage blocked'); },
    setItem() { throw new Error('storage blocked'); }
  }
};
engine.window = engine;
assert.doesNotThrow(() => vm.runInNewContext(read('staging/action-engine.js'), engine, { filename: 'action-engine.js' }));
const minted = engine.FireSActionEngine.nextActionId([]);
assert.strictEqual(minted, 'AC-' + new Date().getFullYear() + '-000001');

const html = read('staging/index.html');
assert.ok(/action-request-stability\.js\?v=1-0-actions/.test(html), 'toets must load the action stability script');
assert.ok(/action-register-hard-fix\.js\?v=105-4-action-stable/.test(html));
assert.ok(/Version 1\.3\.119-toets/.test(html), 'displayed toets version stays 1.3.119-toets');
assert.ok(!/action-request-stability/.test(read('index.html')), 'live index must not load the toets action guard');

console.log('action-request-stability.test.js: ok');
