'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const stagingApp = read('staging/app.js');
const stagingHtml = read('staging/index.html');
const stagingEnv = read('staging/fire-s-env.js');
const stagingSw = read('staging/service-worker.js');

assert.ok(
  /Version 1\.3\.83-toets/.test(stagingHtml) &&
    /app\.js\?v=1-3-83-toets-now/.test(stagingHtml) &&
    /1\.3\.83-toets/.test(stagingEnv) &&
    /fire-s-108-71-toets-home/.test(stagingSw),
  'Toets must show 1.3.83-toets so a phone can tell it has the same-building-count build'
);
assert.ok(
  /function unionCloudRows\(left, right\)/.test(stagingApp) &&
    /openCount > filteredCount/.test(stagingApp) &&
    /otherCount > primaryLen/.test(stagingApp) &&
    !/if \(Array\.isArray\(primary\.data\) && primary\.data\.length > 0\) \{\s*return primary;/.test(
      stagingApp
    ),
  'Toets must use the larger open/filtered cloud inventory instead of keeping a short 5-row pull'
);
assert.ok(
  /function queueLocalPremisesMissingFromCloud\(/.test(stagingApp) &&
    /queueLocalPremisesMissingFromCloud\(/.test(stagingApp) &&
    /retry < 4/.test(stagingApp),
  'Toets must re-queue laptop-only premises after a complete company pull'
);

function rowsFor(count, prefix, companyId) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({
      id: prefix + '-' + i,
      updated_at: '2026-09-08T00:00:00.000Z',
      company_id: companyId,
      inspection_data: { id: prefix + '-' + i, name: 'Building ' + i }
    });
  }
  return rows;
}

function loadFetch(appSrc, spec) {
  const start = appSrc.indexOf('function applyInspectionAccessFilter');
  const end = appSrc.indexOf('function applyInspectionDeleteFilter');
  assert.ok(start > 0 && end > start, 'cloud pull helpers must exist');
  const calls = [];
  function query() {
    const q = {
      _cols: '',
      _filtered: false,
      select(cols) {
        q._cols = cols;
        return q;
      },
      order() {
        return q;
      },
      or() {
        q._filtered = true;
        return q;
      },
      eq() {
        q._filtered = true;
        return q;
      },
      range(from, to) {
        const isIndex = String(q._cols).indexOf('inspection_data') === -1;
        const size = to - from + 1;
        const args = { from: from, to: to, isIndex: isIndex, filtered: q._filtered, size: size };
        calls.push(args);
        return Promise.resolve(spec(args));
      }
    };
    return q;
  }
  const sandbox = {
    currentUserProfile: { companyId: 'co-1' },
    withTimeout(promise) {
      return Promise.resolve(promise);
    },
    supabaseClient: {
      from() {
        return query();
      }
    }
  };
  vm.runInNewContext(appSrc.slice(start, end), sandbox);
  return { fetch: sandbox.fetchCompanyInspectionsFromCloud, calls: calls };
}

(async function run() {
  const five = rowsFor(5, 'co', 'co-1');
  const extra = rowsFor(3, 'own', null);
  const eight = five.concat(extra);

  const split = loadFetch(stagingApp, function spec(args) {
    const source = args.filtered ? five : eight;
    return {
      data: source.slice(args.from, args.to + 1),
      count: source.length,
      error: null
    };
  });
  const splitResult = await split.fetch(
    'user-1',
    'inspection_data, updated_at, company_id'
  );
  assert.strictEqual(splitResult.error, null);
  assert.strictEqual(splitResult.incomplete, false);
  assert.strictEqual(
    splitResult.data.length,
    8,
    'phone must pull untagged own rows when the open inventory is larger than the filtered company list'
  );
  assert.strictEqual(splitResult.expectedTotal, 8);

  const shortFiltered = loadFetch(stagingApp, function spec(args) {
    if (args.filtered && !args.isIndex) {
      if (args.from >= 5) {
        return { data: null, count: eight.length, error: { message: 'network drop' } };
      }
      return {
        data: eight.slice(args.from, Math.min(args.to + 1, 5)),
        count: eight.length,
        error: null
      };
    }
    return {
      data: eight.slice(args.from, args.to + 1),
      count: eight.length,
      error: null
    };
  });
  const recovered = await shortFiltered.fetch('user-1');
  assert.strictEqual(
    recovered.data.length,
    8,
    'an incomplete filtered pull of 5 must still take the open inventory of 8'
  );
  assert.strictEqual(recovered.incomplete, false);

  const qStart = stagingApp.indexOf('function fireSCloudRowInspectionId');
  const qEnd = stagingApp.indexOf('function fireSIsLocalProfileFallback');
  assert.ok(qStart > 0 && qEnd > qStart, 'missing-cloud queue helper must exist');
  const queued = [];
  const queueSandbox = {
    currentUserProfile: { companyId: 'co-1' },
    fireSIsDeletedPremises() {
      return false;
    },
    fireSIsEmptyRecycleLeftoverPremises() {
      return false;
    },
    queueInspectionForUpload(id) {
      queued.push(String(id));
    }
  };
  vm.runInNewContext(stagingApp.slice(qStart, qEnd), queueSandbox);
  const queuedCount = queueSandbox.queueLocalPremisesMissingFromCloud(
    [
      { id: 'co-0', companyId: 'co-1' },
      { id: 'co-1', companyId: 'co-1' },
      { id: 'co-2', companyId: 'co-1' },
      { id: 'co-3', companyId: 'co-1' },
      { id: 'co-4', companyId: 'co-1' },
      { id: 'own-0' },
      { id: 'own-1' },
      { id: 'own-2' }
    ],
    five
  );
  assert.strictEqual(queuedCount, 3);
  assert.deepStrictEqual(queued.sort(), ['own-0', 'own-1', 'own-2']);

  const fStart = stagingApp.indexOf('function fireSIsLocalProfileFallback');
  const fEnd = stagingApp.indexOf('\nfunction getProjectCloudMetadata');
  const filterSandbox = {
    fireSIsDeletedPremises() {
      return false;
    },
    fireSIsEmptyRecycleLeftoverPremises() {
      return false;
    }
  };
  vm.runInNewContext(stagingApp.slice(fStart, fEnd), filterSandbox);
  const profile = {
    id: 'user-1',
    email: 'owner@example.com',
    companyId: 'co-1'
  };
  const visible = filterSandbox.fireSFilterProjectsForProfile(
    [
      { id: 'co-row', companyId: 'co-1', createdByUserId: 'user-2' },
      { id: 'legacy', organisationName: 'Tester 1' },
      { id: 'mine-untagged', createdByUserId: 'user-1' },
      { id: 'other-untagged', createdByUserId: 'user-9' },
      { id: 'other-co', companyId: 'other-co', createdByUserId: 'user-1' }
    ],
    profile,
    false
  );
  assert.deepStrictEqual(
    visible.map(function (row) { return row.id; }).sort(),
    ['co-row', 'legacy', 'mine-untagged'],
    'company Home must keep company rows, own untagged leftovers, and untagged legacy buildings'
  );

  console.log('same-building-count.test.js: ok');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
