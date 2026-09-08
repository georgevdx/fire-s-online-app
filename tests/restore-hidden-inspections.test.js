'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const repair = read('SUPABASE_repair_hidden_inspections.sql');
const liveRestore = read('SUPABASE_live_restore_inspections.sql');
const sql = read('SUPABASE_company_entitlement.sql');
const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const js = read('fire-s-entitlement.js');

assert.ok(!/delete from public\.inspections/i.test(repair), 'repair must not delete inspections');
assert.ok(!/truncate\s+table\s+public\.inspections/i.test(repair), 'repair must not truncate inspections');
assert.ok(!/drop table\s+public\.inspections/i.test(repair), 'repair must not drop inspections');
assert.ok(/fire_s_inspections_select/.test(repair));
assert.ok(/notify pgrst/i.test(repair));
assert.ok(/still_null_company/.test(repair));
assert.ok(/disable trigger fire_s_inspections_entitlement_guard/.test(repair));
assert.ok(/trial_started_at is null/.test(repair));
assert.ok(/join public.companies c on c.id = m.company_id/.test(repair));
assert.ok(/inspections_company_id_fkey/.test(repair));
assert.ok(!/set company_id = nullif\(trim\(coalesce\(\s*i\.inspection_data->>'companyId'/.test(repair));
assert.ok(/auth\.uid\(\) is null/.test(sql));
assert.ok(/fire_s_inspections_select/.test(sql));

assert.ok(!/delete from public\.inspections/i.test(liveRestore));
assert.ok(/fire_s_inspections_select/.test(liveRestore));
assert.ok(/from public.inspections i/.test(liveRestore) && /order by \(\s*select count\(\*\)::int\s*from public.inspections i/.test(liveRestore.replace(/\n/g, '\n')));
assert.ok(/set status = 'inactive'/.test(liveRestore));
assert.ok(/set status = 'active'/.test(liveRestore));
assert.ok(/notify pgrst/i.test(liveRestore));
const liveOpen = read('SUPABASE_live_open_inspections.sql');
assert.ok(/authenticated_can_select/.test(liveOpen));
assert.ok(/grant select on table public.inspections to authenticated/.test(liveOpen));
assert.ok(!/delete from public\.inspections/i.test(liveOpen));
assert.ok(/fire-s/.test(liveOpen.toLowerCase()));

assert.ok(/fireSFilterProjectsForProfile/.test(liveApp));
assert.ok(/fireSFilterProjectsForProfile/.test(stagingApp));
assert.ok(/fetchCompanyInspectionsFromCloud/.test(liveApp));
assert.ok(/const pageSizes = \[100, 40, 10, 1\]/.test(liveApp));
assert.ok(/\.range\(from, from \+ size - 1\)/.test(liveApp));
assert.ok(/const pageSizes = \[100, 40, 10, 1\]/.test(stagingApp));
assert.ok(/incomplete: true/.test(stagingApp));
assert.ok(/count: 'exact'/.test(stagingApp));
assert.ok(/incomplete: true/.test(liveApp));
assert.ok(!/if \(rows\.length\) return \{ data: rows, error: null \}/.test(liveApp));
assert.ok(!/if \(rows\.length\) return \{ data: rows, error: null \}/.test(stagingApp));
assert.ok(/mergeCloudRowsIntoProjects/.test(liveApp));
assert.ok(/mergeCloudRowsIntoProjects/.test(stagingApp));
assert.ok(/withTimeout\(query, 10000\)/.test(liveApp));
assert.ok(/filledEmptyDevice/.test(liveApp));
assert.ok(/filledEmptyDevice/.test(stagingApp));
assert.ok(/Local inspections were kept/.test(liveApp));
assert.ok(/Local inspections were kept/.test(stagingApp));
assert.ok(/fireSIsPreferredCompanyName/.test(liveApp));
assert.ok(/fireSIsPreferredCompanyName/.test(stagingApp));

const start = liveApp.indexOf('function fireSIsLocalProfileFallback');
const end = liveApp.indexOf('\nfunction getProjectCloudMetadata');
assert.ok(start > 0 && end > start, 'visibility helpers must sit next to getVisibleProjectsForCurrentUser');

const sandbox = {
  fireSIsDeletedPremises: function () { return false; },
  fireSIsEmptyRecycleLeftoverPremises: function () { return false; }
};
vm.runInNewContext(liveApp.slice(start, end), sandbox);

const owned = {
  id: 'insp-1',
  createdByUserId: 'user-1',
  createdByEmail: 'owner@example.com'
};
const unstamped = {
  id: 'insp-2',
  createdByUserId: 'user-1',
  createdByEmail: 'owner@example.com'
};
const otherCompany = {
  id: 'insp-3',
  companyId: 'other-co',
  createdByUserId: 'user-1',
  createdByEmail: 'owner@example.com'
};
const stranger = {
  id: 'insp-4',
  companyId: 'co-1',
  createdByUserId: 'user-2'
};

const profile = {
  id: 'user-1',
  email: 'owner@example.com',
  companyId: 'co-1'
};

let visible = sandbox.fireSFilterProjectsForProfile(
  [owned, unstamped, otherCompany, stranger],
  profile,
  false
);
assert.deepStrictEqual(
  visible.map(function (row) { return row.id; }).sort(),
  ['insp-1', 'insp-2', 'insp-4'],
  'company filter must keep unstamped own rows and matching company rows'
);

visible = sandbox.fireSFilterProjectsForProfile(
  [
    { id: 'insp-1', companyId: 'wrong-co', createdByUserId: 'user-1', createdByEmail: 'owner@example.com' },
    { id: 'insp-2', companyId: 'also-wrong', createdByUserId: 'user-1', createdByEmail: 'owner@example.com' },
    { id: 'insp-3', companyId: 'wrong-co', createdByUserId: 'user-2' }
  ],
  profile,
  false
);
assert.deepStrictEqual(
  visible.map(function (row) { return row.id; }).sort(),
  ['insp-1', 'insp-2'],
  'if company stamps mismatch, keep the user own inspections instead of an empty Gateway'
);

visible = sandbox.fireSFilterProjectsForProfile(
  [owned, stranger],
  { id: 'local-user', email: 'local@fire-s.app' },
  false
);
assert.strictEqual(visible.length, 2, 'local fallback profile must not hide stored inspections');

visible = sandbox.fireSFilterProjectsForProfile(
  [owned, stranger],
  null,
  false
);
assert.strictEqual(visible.length, 2, 'missing profile must not empty the list');

console.log('restore-hidden-inspections.test.js: ok');
