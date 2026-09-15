'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('staging/app.js');
const html = read('staging/index.html');

assert.ok(
  /function fireSPaintLeftoverCommandSubtitle\(el, text\)/.test(app) &&
    /if \(window\.__fireS136A10Installed\) return/.test(app) &&
    /function paintCommandSubtitle\(c\)\{/.test(app) &&
    /window\.fireSPaintOwnerCommandSubtitle = paintCommandSubtitle/.test(app),
  '136A10 must own the Executive Command Centre count line'
);

const leftoverNames = [
  'FIRE-S RC 1.3.6A.6',
  'FIRE-S RC 1.3.6A.7',
  'FIRE-S RC 1.3.6A.8',
  'FIRE-S RC 1.3.6A.9'
];
leftoverNames.forEach((name, idx) => {
  const start = app.indexOf(name);
  const end = idx < leftoverNames.length - 1
    ? app.indexOf(leftoverNames[idx + 1], start)
    : app.indexOf('FIRE-S RC 1.3.6A.10', start);
  const slice = app.slice(start, end);
  assert.ok(start > 0 && end > start, name + ' must exist');
  assert.ok(
    /fireSPaintLeftoverCommandSubtitle\(/.test(slice),
    name + ' must yield the count line to 136A10'
  );
  assert.ok(
    !/subtitle\.textContent = `\$\{/.test(slice),
    name + ' must not write mainCommandSubtitle itself'
  );
});

assert.ok(
  /Version 1\.3\.81-toets/.test(html) &&
    /app\.js\?v=1-3-81-toets-now/.test(html),
  'Toets must cache-bust the stable Command Centre counts'
);

const start = app.indexOf('(function fireS136A10StableVisibleKpis(){');
const end = app.indexOf('(function fireS136A11ProjectKpiSingleMatcher(){', start);
assert.ok(start > 0 && end > start, '136A10 KPI matcher must exist');

const subtitle = { textContent: 'Showing 6 inspections available in this workspace.' };
const row = {
  hidden: false,
  style: { display: '', setProperty() {} },
  classList: { add() {} },
  getAttribute() { return ''; },
  setAttribute() {},
  removeAttribute() {},
  querySelector() { return { textContent: '4' }; },
  innerHTML: ''
};
const body = { classList: { contains() { return false; } } };
const nodes = {
  mainCommandSubtitle: subtitle,
  fireSOwnerKpiRow: row,
  mainCommandCentre: { querySelector() { return null; }, insertBefore() {}, appendChild() {} },
  homeSection: { style: { display: 'block' } },
  projectListSection: { style: { display: 'none' } }
};

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 3);
const overdueDay = yesterday.toISOString().slice(0, 10);
const thisMonth = new Date().toISOString().slice(0, 10);

const projects = [
  {
    id: 'action-only',
    inspectionStatus: 'finalised',
    completedAt: thisMonth + 'T08:00:00.000Z',
    answers: [{ answer: 'No' }]
  },
  {
    id: 'late-site',
    inspectionStatus: 'finalised',
    scheduledDate: overdueDay,
    answers: [{ answer: 'No' }]
  },
  {
    id: 'clear-site',
    inspectionStatus: 'finalised',
    completedAt: thisMonth + 'T08:00:00.000Z',
    answers: [{ answer: 'Yes' }]
  },
  {
    id: 'history-clear',
    status: 'open',
    inspectionHistory: [{
      completedAt: '2026-07-21T08:00:00.000Z',
      answers: [{ answer: 'Yes' }]
    }]
  }
];

const windowObj = {
  __fireS136A10Installed: false,
  setTimeout() { return 0; },
  setInterval() { return 0; },
  addEventListener() {},
  getProjects() { return projects; },
  getVisibleProjectsForCurrentUser(list) { return list; },
  fireSIsInspectionOverdue(project) {
    const day = String(project && (project.scheduledDate || project.followUpDate) || '').slice(0, 10);
    return Boolean(day && day < new Date().toISOString().slice(0, 10));
  },
  MutationObserver: class { observe() {} }
};

const context = {
  window: windowObj,
  document: {
    readyState: 'complete',
    body,
    getElementById(id) { return nodes[id] || null; },
    querySelector(sel) {
      if (sel === '.main-command-top p') return subtitle;
      if (sel === '#mainCommandCentre .main-command-stats') return null;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement() { return row; }
  },
  MutationObserver: class { observe() {} },
  requestAnimationFrame(fn) { fn(); },
  getComputedStyle(el) {
    return { display: el && el.style && el.style.display ? el.style.display : 'block' };
  },
  setTimeout() { return 0; },
  setInterval() { return 0; },
  console,
  Date,
  Math,
  Number,
  String,
  Array,
  Object,
  Boolean,
  JSON
};
context.window = Object.assign(windowObj, context);
const helperStart = app.indexOf('function fireSPaintLeftoverCommandSubtitle');
const helperEnd = app.indexOf('// FIRE-S RC 1.3.1', helperStart);
assert.ok(helperStart > 0 && helperEnd > helperStart, 'leftover subtitle helper must exist');
vm.runInNewContext(app.slice(helperStart, helperEnd) + app.slice(start, end), context);

const production = '1 premises require action · 1 overdue · 0 scheduled · 2 compliant · 3 this month.';
assert.strictEqual(
  subtitle.textContent,
  production,
  'Owner count line must use the same exclusive Action vs Overdue buckets as the cards'
);

const leftover = '2 premises require action · 1 overdue · 0 scheduled · 1 compliant · 3 this month.';
context.window.fireSPaintLeftoverCommandSubtitle(subtitle, leftover);
assert.strictEqual(
  subtitle.textContent,
  production,
  'Leftover KPI layers must not flip the count line after 136A10 is installed'
);

context.window.fireSPaintOwnerCommandSubtitle(context.window.fireSProductionKpiCounts());
assert.strictEqual(
  subtitle.textContent,
  production,
  'Repainting the same owner counts must leave the subtitle unchanged'
);

subtitle.textContent = leftover;
context.window.fireSProductionRenderKpis();
assert.strictEqual(
  subtitle.textContent,
  production,
  '136A10 must restore its own count line if a leftover write slips through'
);

console.log('stable-command-counts.test.js: ok');
