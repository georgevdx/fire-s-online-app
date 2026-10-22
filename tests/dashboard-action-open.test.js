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
assert.ok(
  /leaveFullscreen\(\)/.test(
    dashSrc.slice(
      dashSrc.indexOf('function openInspectionFromDashboard'),
      dashSrc.indexOf('function drillPanelHtml')
    )
  ),
  'Opening a premises from the dashboard must leave fullscreen before Quick Actions'
);
assert.ok(/app\.js\?v=1-3-123-toets/.test(html));
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
  getChecklistForProject(project) {
    if (project && project.inspectionType === 'Retail Store Inspection') {
      return [
        {
          'Item Number': '1',
          Section: 'Public Area Safety',
          'Checklist Item': 'Are customer escape routes clear and unobstructed?'
        }
      ];
    }
    return checklist;
  }
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

const reportChecklist = checklist.concat([
  {
    'Item Number': '20',
    Section: 'Means of Escape',
    'Checklist Item': 'Do exit doors have the correct locking mechanisms and open freely without keys, tools or special knowledge?',
    'Non Compliance Text': 'Exit doors do not have the correct locking mechanisms, or they do not open freely in an emergency.',
    Severity: 'High'
  },
  {
    'Item Number': '23',
    Section: 'Emergency Lights',
    'Checklist Item': 'Are the emergency lights of a sufficient type and coverage for the premises?',
    'Non Compliance Text': 'Emergency lighting is not of a sufficient type or does not provide adequate coverage.',
    Severity: 'High'
  },
  {
    'Item Number': '26',
    Section: 'Hazardous Substances',
    'Checklist Item': 'Do they require registration? If yes, record the certificate expiry date.',
    'Non Compliance Text': 'Hazardous substances require registration, but a valid certificate is missing or the expiry date is overdue.',
    Severity: 'High'
  },
  {
    'Item Number': '29',
    Section: 'Housekeeping',
    'Checklist Item': 'Is waste being dealt with correctly?',
    'Non Compliance Text': 'Waste is not being dealt with correctly and is accumulating.',
    Severity: 'Medium'
  }
]);
context.getChecklistForProject = function (host) {
  if (host && host.inspectionType === 'Retail Store Inspection') {
    return [
      {
        'Item Number': '1',
        Section: 'Public Area Safety',
        'Checklist Item': 'Are customer escape routes clear and unobstructed?'
      }
    ];
  }
  return reportChecklist;
};
const saverite = {
  id: 'saverite-live',
  siteName: 'Midcity square',
  organisationName: 'Saverite Supermarket',
  productType: 'Fire Safety Compliance',
  inspectionType: 'Retail Store Inspection',
  completedAt: '2026-10-10T08:00:00.000Z',
  answers: [
    {
      answer: 'No',
      itemIndex: 22,
      itemNumber: '23',
      question: 'Are the emergency lights of a sufficient type and coverage for the premises?',
      sectionName: 'Emergency Lights'
    }
  ],
  actions: [],
  inspectionHistory: [
    {
      productType: 'Fire Safety Compliance',
      inspectionType: 'General Fire Inspection',
      inspectionDate: '2026-08-20',
      completedAt: '2026-08-20T08:00:00.000Z',
      answers: [
        {
          answer: 'No',
          itemIndex: 22,
          itemNumber: '20',
          question: 'Are the emergency lights of a sufficient type and coverage for the premises?',
          sectionName: 'Emergency Lights',
          note: 'Wrong lock'
        },
        {
          answer: 'No',
          itemIndex: 28,
          itemNumber: '26',
          question: 'Is waste being dealt with correctly?',
          sectionName: 'Housekeeping',
          note: 'Drain within 2m'
        }
      ],
      actions: [
        {
          itemNumber: '20',
          itemIndex: 22,
          priority: 'High',
          responsible: 'Approved Contractor / Building Owner',
          question: 'Are the emergency lights of a sufficient type and coverage for the premises?',
          status: 'Open'
        },
        {
          itemNumber: '26',
          itemIndex: 28,
          priority: 'High',
          responsible: 'Approved Contractor / Building Owner',
          question: 'Is waste being dealt with correctly?',
          status: 'Open'
        }
      ]
    }
  ]
};
const saveriteSource = context.window.fireSDashboardActionSource(saverite);
const saveriteRows = Array.from(context.window.fireSDashboardCharts.actionRecords(saveriteSource.project));
assert.strictEqual(saveriteRows.length, 2);
assert.strictEqual(saveriteRows[0].category, 'Means of Escape');
assert.ok(/Exit doors do not have the correct locking mechanisms/.test(String(saveriteRows[0].question)));
assert.strictEqual(saveriteRows[1].category, 'Hazardous Substances');
assert.ok(/Hazardous substances require registration/.test(String(saveriteRows[1].question)));
assert.ok(!saveriteRows.some(row => /emergency lights|waste being dealt/i.test(String(row.question))));

console.log('dashboard-action-open.test.js: ok');
