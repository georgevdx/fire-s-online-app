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
  /function fireSInspectionFilterDate\(/.test(app),
  'Toets must pick an inspection/booking date for the Gateway date filter'
);

const helperStart = app.indexOf('function fireSInspectionFilterDate(project)');
const helperEnd = app.indexOf('function getProjectDateForFiltering(project)', helperStart);
assert.ok(helperStart > 0 && helperEnd > helperStart, 'Inspection date helper must exist');
const helper = app.slice(helperStart, helperEnd).replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(
  !/lastSaved/.test(helper) && !/updated_at/.test(helper) && !/created_at/.test(helper),
  'Today must not use lastSaved / updated_at / created_at from a cloud sync'
);
assert.ok(
  /inspectionDate/.test(helper) && /scheduledDate/.test(helper),
  'Today must use inspection date, then scheduled/follow-up date'
);

assert.ok(
  /inspection date/.test(html) && !/activity date/.test(html),
  'How-this-filter-works copy must say inspection date, not activity date'
);

const sandbox = {
  Date,
  String,
  Number,
  Boolean,
  console
};
sandbox.window = sandbox;
vm.runInNewContext(
  [
    'function normaliseDateString(value) {',
    '  if (!value) return "";',
    '  const date = new Date(value);',
    '  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);',
    '  return date.toISOString().slice(0, 10);',
    '}',
    helper,
    'function getInspectionGatewayDateFilters() { return { from: fromDate, to: toDate }; }',
    'var fromDate = "2026-09-10";',
    'var toDate = "2026-09-10";',
    'function projectMatchesInspectionDateFilter(project) {',
    '  const filters = getInspectionGatewayDateFilters();',
    '  const projectDate = fireSInspectionFilterDate(project);',
    '  if (!filters.from && !filters.to) return true;',
    '  if (!projectDate) return false;',
    '  if (filters.from && projectDate < filters.from) return false;',
    '  if (filters.to && projectDate > filters.to) return false;',
    '  return true;',
    '}'
  ].join('\n'),
  sandbox
);

const today = { inspectionDate: '2026-09-10', lastSaved: '2026-09-10T08:00:00.000Z' };
const oldWork = { inspectionDate: '2026-03-01', lastSaved: '2026-09-10T08:00:00.000Z', updated_at: '2026-09-10T08:00:00.000Z' };
const syncOnly = { lastSaved: '2026-09-10T08:00:00.000Z', updated_at: '2026-09-10T08:00:00.000Z', created_at: '2026-01-02' };
const bookedToday = { scheduledDate: '2026-09-10', lastSaved: '2026-09-10T08:00:00.000Z' };

assert.strictEqual(sandbox.fireSInspectionFilterDate(today), '2026-09-10');
assert.strictEqual(sandbox.fireSInspectionFilterDate(oldWork), '2026-03-01');
assert.strictEqual(sandbox.fireSInspectionFilterDate(syncOnly), '');
assert.strictEqual(sandbox.fireSInspectionFilterDate(bookedToday), '2026-09-10');

assert.ok(sandbox.projectMatchesInspectionDateFilter(today), 'A premises inspected today stays on Today');
assert.ok(!sandbox.projectMatchesInspectionDateFilter(oldWork), 'An old inspection must not appear on Today just because it synced today');
assert.ok(!sandbox.projectMatchesInspectionDateFilter(syncOnly), 'A cloud-sync stamp alone is not work today');
assert.ok(sandbox.projectMatchesInspectionDateFilter(bookedToday), 'A booking dated today still shows on Today');

console.log('inspection-date-filter.test.js: ok');
