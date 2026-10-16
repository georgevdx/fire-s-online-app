'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const dashSrc = read('staging/fire-s-management-dashboard.js');
const appSrc = read('staging/app.js');
const html = read('staging/index.html');

assert.ok(!/fireSOpenActionReport/.test(dashSrc) && !/fireSOpenActionReport/.test(appSrc));
assert.ok(!/data-pbi-history/.test(dashSrc));
assert.ok(/function openInspectionFromDashboard\(projectId, itemIndex\)/.test(dashSrc));
assert.ok(/app\.js\?v=1-3-123-pdf/.test(html));
assert.ok(/fire-s-management-dashboard\.js\?v=1-21-action-label/.test(html));

const checklist = [
  {
    'Item Number': '1',
    Section: 'Housekeeping',
    'Checklist Item': 'Is waste being dealt with correctly?',
    'Non Compliance Text': 'Waste is not controlled.'
  },
  {
    'Item Number': '8',
    Section: 'Emergency Lights',
    'Checklist Item': 'Are the emergency lights of a sufficient type and coverage for the premises?',
    'Non Compliance Text': 'Emergency lighting is inadequate.'
  },
  {
    'Item Number': '2',
    Section: 'Means of Escape',
    'Checklist Item': 'Do exit doors have the correct locking mechanisms?',
    'Non Compliance Text': 'Exit doors do not have the correct locking mechanisms, or they do not open freely in an emergency.'
  }
];

function latestInspectionHistoryIndex(project) {
  const history = Array.isArray(project && project.inspectionHistory) ? project.inspectionHistory : [];
  return history.length ? 0 : -1;
}

const documentObj = {
  readyState: 'complete',
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  createElement() {
    return { style: {}, appendChild() {}, addEventListener() {}, setAttribute() {} };
  },
  fullscreenElement: null
};
const windowObj = { addEventListener() {}, setTimeout(fn) { return 0; } };
const context = {
  window: windowObj,
  document: documentObj,
  localStorage: { getItem() { return ''; }, setItem() {} },
  console,
  setTimeout(fn) { return 0; },
  URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
  Blob: function Blob() {},
  alert() {},
  latestInspectionHistoryIndex,
  getChecklistForProject() { return checklist; }
};
context.window = Object.assign(windowObj, context);
vm.runInNewContext(dashSrc, context);

const exitDoor = {
  answer: 'no',
  itemIndex: 1,
  itemNumber: '2',
  question: 'Are the emergency lights of a sufficient type and coverage for the premises?',
  sectionName: 'Emergency Lights'
};
const project = {
  id: 'saverite',
  siteName: 'Midcity square',
  organisationName: 'Saverite Supermarket',
  completedAt: '2026-08-20T08:00:00.000Z',
  answers: [
    {
      answer: 'no',
      itemIndex: 1,
      itemNumber: '8',
      question: 'Are the emergency lights of a sufficient type and coverage for the premises?',
      sectionName: 'Emergency Lights'
    }
  ],
  actions: [],
  inspectionHistory: [
    {
      inspectionDate: '2026-10-01',
      completedAt: '2026-08-01T08:00:00.000Z',
      answers: [exitDoor],
      actions: []
    }
  ]
};

const source = context.window.fireSDashboardActionSource(project);
const rows = Array.from(context.window.fireSDashboardCharts.actionRecords(source.project));
assert.strictEqual(rows.length, 1);
assert.strictEqual(rows[0].category, 'Means of Escape');
assert.ok(/^Exit doors do not have the correct locking mechanisms/.test(String(rows[0].question)));
assert.ok(!/emergency lights/i.test(String(rows[0].question)));
assert.ok(!/Emergency Lights/.test(String(rows[0].category)));

console.log('dashboard-action-open.test.js: ok');
