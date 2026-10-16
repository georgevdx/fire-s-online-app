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

assert.ok(
  /function actionSource\(project\)/.test(dashSrc) &&
    /latestInspectionHistoryIndex\(project\)/.test(dashSrc) &&
    /data-pbi-history="\$\{row\.historyIndex\}"/.test(dashSrc) &&
    /fireSOpenActionReport/.test(dashSrc),
  'Dashboard Open must carry the same finalised inspection as Latest Report'
);
assert.ok(
  /function fireSOpenActionReport\(detail\)/.test(appSrc) &&
    /to: 'dashboard'/.test(appSrc) &&
    /Back to dashboard/.test(appSrc) &&
    /data-item-number=/.test(appSrc) &&
    /if \(wanted === 'dashboard'\) return;/.test(appSrc),
  'Open must show that inspection report and return to the dashboard'
);
assert.ok(
  /app\.js\?v=1-3-124-action-open/.test(html) &&
    /fire-s-management-dashboard\.js\?v=1-20-action-open/.test(html),
  'Toets must cache-bust the action-report fix'
);

function latestInspectionHistoryIndex(project) {
  const history = Array.isArray(project && project.inspectionHistory)
    ? project.inspectionHistory
    : [];
  if (!history.length) return -1;
  let latestIndex = history.length - 1;
  let latestTs = -1;
  history.forEach((inspection, historyIndex) => {
    const value = inspection?.inspectionDate || inspection?.completedAt || '';
    const ts = value ? new Date(value).getTime() : 0;
    if (ts >= latestTs) {
      latestTs = ts;
      latestIndex = historyIndex;
    }
  });
  return latestIndex;
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
const windowObj = {
  addEventListener() {},
  setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; }
};
const context = {
  window: windowObj,
  document: documentObj,
  localStorage: { getItem() { return ''; }, setItem() {} },
  console,
  setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; },
  URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
  Blob: function Blob() {},
  alert() {},
  latestInspectionHistoryIndex
};
context.window = Object.assign(windowObj, context);
vm.runInNewContext(dashSrc, context);

const liveFindings = [
  {
    answer: 'no',
    itemIndex: 3,
    itemNumber: '8',
    question: 'Are the emergency lights of a sufficient type and coverage for the premises?',
    sectionName: 'Emergency Lights'
  },
  {
    answer: 'no',
    itemIndex: 9,
    itemNumber: '14',
    question: 'Is waste being dealt with correctly?',
    sectionName: 'Housekeeping'
  }
];
const reportFindings = [
  {
    answer: 'no',
    itemIndex: 1,
    itemNumber: '2',
    question: 'Do exit doors open freely in an emergency?',
    sectionName: 'Means of Escape',
    note: 'Wrong lock'
  },
  {
    answer: 'no',
    itemIndex: 6,
    itemNumber: '9',
    question: 'Are hazardous substances registered with a valid certificate?',
    sectionName: 'Hazardous Substances'
  }
];
const project = {
  id: 'saverite',
  siteName: 'Midcity square',
  organisationName: 'Saverite Supermarket',
  completedAt: '2026-08-20T08:00:00.000Z',
  inspectionDate: '2026-08-01',
  answers: liveFindings,
  actions: [
    { itemIndex: 3, itemNumber: '8', priority: 'High', responsible: 'Approved Contractor / Building Owner', status: 'Open', createdDate: '2026-08-20' }
  ],
  inspectionHistory: [
    {
      inspectionDate: '2026-10-01',
      completedAt: '2026-08-01T08:00:00.000Z',
      answers: reportFindings,
      actions: []
    }
  ]
};

const source = context.window.fireSDashboardActionSource(project);
assert.strictEqual(source.historyIndex, 0, 'Action list must use the Latest Report history index');
const rows = Array.from(context.window.fireSDashboardCharts.actionRecords(source.project));
const questions = rows.map(row => String(row.question));
assert.deepStrictEqual(
  questions,
  reportFindings.map(item => item.question),
  'Filtered actions must be the latest report findings, not the live workspace answers'
);
assert.ok(!questions.some(question => /emergency lights|waste being dealt/i.test(question)));

const opened = [];
const reportNodes = reportFindings.map(item => ({
  attrs: {
    'data-item-number': item.itemNumber,
    'data-item-index': String(item.itemIndex),
    'data-question': item.question
  },
  className: '',
  classList: {
    add(name) { this.owner.className += ' ' + name; },
    remove() {}
  },
  getAttribute(name) { return this.attrs[name] || ''; },
  scrollIntoView() { this.scrolled = true; }
}));
reportNodes.forEach(node => { node.classList.owner = node; });

const start = appSrc.indexOf('function focusActionFinding(');
const end = appSrc.indexOf('window.fireSOpenActionReport = fireSOpenActionReport;');
assert.ok(start > 0 && end > start, 'Action report opener must be present');
const openerSrc = appSrc.slice(start, end + 'window.fireSOpenActionReport = fireSOpenActionReport;'.length);
const openerContext = {
  window: { setTimeout(fn) { fn(); return 0; } },
  document: {
    getElementById(id) {
      if (id === 'reportSection') {
        return { querySelectorAll() { return reportNodes; } };
      }
      return null;
    }
  },
  getProjects() { return [project]; },
  latestInspectionHistoryIndex,
  closeInspectionOpenGate() { openerContext.gateClosed = true; },
  generateArchivedInspectionReport(projectId, historyIndex) {
    opened.push({ projectId, historyIndex });
  },
  liveReportContext: null,
  alert(message) { throw new Error(message); },
  setTimeout(fn) { fn(); return 0; }
};
openerContext.window = Object.assign(openerContext.window, openerContext);
vm.runInNewContext(openerSrc, openerContext);

const openedOk = openerContext.window.fireSOpenActionReport({
  projectId: 'saverite',
  itemIndex: '1',
  historyIndex: '0',
  itemNumber: '2',
  question: reportFindings[0].question
});
assert.strictEqual(openedOk, true);
assert.deepStrictEqual(opened, [{ projectId: 'saverite', historyIndex: 0 }]);
assert.strictEqual(openerContext.gateClosed, true);
assert.strictEqual(openerContext.window.__fireSReportReturn.to, 'dashboard');
assert.ok(reportNodes[0].className.includes('is-dashboard-focus'));
assert.ok(!reportNodes[1].className.includes('is-dashboard-focus'));
assert.ok(reportNodes[0].scrolled);

console.log('dashboard-action-open.test.js: ok');
