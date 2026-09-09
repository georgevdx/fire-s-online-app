'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('SUPABASE_dashboard_stats.sql');
const statsJs = read('staging/fire-s-dashboard-stats.js');
const app = read('staging/app.js');
const html = read('staging/index.html');
const lists = read('staging/fire-s-owner-lists.js');
const inspector = read('staging/inspector-v4.js');

assert.ok(
  /create or replace function public\.fire_s_company_dashboard_stats/.test(sql),
  'SQL must define fire_s_company_dashboard_stats'
);
assert.ok(
  /create or replace function public\.fire_s_list_company_premises/.test(sql),
  'SQL must define paginated premise list'
);
assert.ok(
  /create or replace function public\.fire_s_get_company_premise/.test(sql),
  'SQL must load one premise by id'
);
assert.ok(
  /fire_s_is_company_member/.test(sql) && /raise exception 'Not a member of this company'/.test(sql),
  'Stats RPC must refuse another company'
);
assert.ok(
  /fire_s_inspection_is_active_premise/.test(sql) &&
    /fire_s_inspection_is_deleted/.test(sql) &&
    /fire_s_inspection_is_recycle_leftover/.test(sql),
  'SQL must use one active-premise definition'
);
assert.ok(
  /grant execute on function public\.fire_s_company_dashboard_stats\(uuid\) to authenticated/.test(sql),
  'Stats RPC is granted to authenticated only'
);
assert.ok(
  /revoke all on function public\.fire_s_company_dashboard_stats\(uuid\) from public/.test(sql),
  'Stats RPC must not be public'
);
assert.ok(
  /p_limit integer default 25/.test(sql) && /least\(coalesce\(p_limit, 25\), 50\)/.test(sql),
  'Gateway pages must stay small'
);

assert.ok(/fire-s-dashboard-stats\.js\?v=1-0-stats/.test(html), 'Toets must load the stats service');
assert.ok(/app\.js\?v=1-3-64-stats/.test(html), 'Toets app cache tag');
assert.ok(/fire-s-owner-lists\.js\?v=1-1-stats/.test(html), 'Toets owner-list cache tag');
assert.ok(
  /hydrateAll === true/.test(app) && /Dashboard statistics updated/.test(app),
  'Startup must not download every inspection_data row to paint Home'
);
assert.ok(
  /fireSEnsurePremiseLoaded/.test(app) && /premiseFetchAttempted/.test(app),
  'Opening a premises must load that row on demand'
);
assert.ok(
  /fireSAuthoritativeKpiCounts/.test(app),
  'Home KPI cards must read the shared stats service'
);
assert.ok(
  /Total premises:/.test(lists) && /Premises inspected:/.test(lists),
  'Home must label Total premises and Premises inspected separately'
);
assert.ok(
  /fireSSearchCompanyPremises/.test(inspector),
  'Inspector search must query the company database'
);
assert.ok(
  /Never paint a partial array length as a final total/.test(statsJs),
  'Implementation summary must record the root cause'
);

const sandbox = {
  window: {},
  console,
  setTimeout() {},
  clearTimeout() {},
  document: {
    readyState: 'complete',
    addEventListener() {},
    getElementById() { return null; }
  },
  localStorage: {
    _data: {},
    getItem(key) { return this._data[key] || null; },
    setItem(key, value) { this._data[key] = String(value); },
    removeItem(key) { delete this._data[key]; }
  },
  navigator: { onLine: true }
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(statsJs, sandbox);

const api = sandbox.FireSDashboardStats;
assert.equal(typeof api, 'object', 'FireSDashboardStats API must exist');
assert.equal(api.formatPremisesHeadline(1247, 'ready'), 'Total premises: 1247');
assert.equal(api.formatPremisesHeadline(1, 'ready'), 'Total premises: 1');
assert.equal(api.formatPremisesHeadline(0, 'loading'), 'Loading premises…');
assert.equal(api.formatPremisesHeadline(0, 'error'), 'Premises total unavailable');
assert.ok(!/ of /.test(api.formatPremisesHeadline(86, 'ready')), 'Home must not show 86 of 124');

const live = {
  id: 'mall',
  organisationName: 'West End Mall',
  completedAt: '2026-06-01',
  answers: [{ answer: 'Yes' }]
};
const deleted = { id: 'gone', deletedAt: '2026-08-01', organisationName: 'Gone' };
const leftover = {
  id: 'recycle',
  organisationName: 'Recycle leftover',
  recycleBin: { currentInspections: [{ id: 'old' }] }
};
assert.equal(api.isActivePremise(live), true);
assert.equal(api.isActivePremise(deleted), false);
assert.equal(api.isActivePremise(leftover), false);

sandbox.fireSProductionKpiMatches = function (project, filter) {
  if (filter === 'compliant') return !!(project.completedAt && project.answers && project.answers.length);
  return false;
};
const counted = api.statsFromProjects([live, deleted, leftover]);
assert.equal(counted.totalPremises, 1, 'Deleted and Recycle leftovers must not enter totalPremises');

const pageOf25 = [];
for (let i = 0; i < 25; i += 1) {
  pageOf25.push({ id: 'p' + i, organisationName: 'Site ' + i });
}
assert.notEqual(
  api.statsFromProjects(pageOf25).totalPremises,
  1247,
  'A Gateway page of 25 must not be treated as 1,247'
);
assert.equal(api.statsFromProjects(pageOf25).totalPremises, 25);

api.writeSnapshot('co-a', { totalPremises: 1247, premisesInspected: 86, companyId: 'co-a' });
const snapA = api.readSnapshot('co-a');
assert.equal(snapA.stats.totalPremises, 1247);
assert.equal(api.readSnapshot('co-b'), null, 'Company B must not read Company A snapshot');
api.clearSnapshot('co-a');
assert.equal(api.readSnapshot('co-a'), null, 'Logout/company switch must drop the snapshot');

const normalized = api.normalizeStats({
  total_premises: '1247',
  premises_inspected: 86,
  scheduled_inspections: 12,
  compliant_premises: 83,
  premises_with_open_actions: 21,
  open_action_items: 46,
  overdue_inspections: 7,
  inspections_this_month: 9
}, 'co-a');
assert.equal(normalized.totalPremises, 1247);
assert.equal(normalized.premisesInspected, 86);
assert.equal(normalized.scheduledInspections, 12);

const many = [];
for (let i = 0; i < 1247; i += 1) {
  many.push({ id: 'prem-' + i, organisationName: 'Premises ' + i });
}
assert.equal(api.statsFromProjects(many).totalPremises, 1247);

console.log('dashboard-stats-scale.test.js: ok');
