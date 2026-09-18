'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveApp = read('app.js');
const liveHtml = read('index.html');
const liveEnv = read('fire-s-env.js');
const liveSw = read('service-worker.js');
const stagingApp = read('staging/app.js');
const stagingHtml = read('staging/index.html');
const stagingEnv = read('staging/fire-s-env.js');
const stagingSw = read('staging/service-worker.js');

assert.ok(
  /Version 1\.3\.65/.test(liveHtml) &&
    /app\.js\?v=1-3-65-count/.test(liveHtml) &&
    /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.65'/.test(liveEnv) &&
    /fire-s-108-72-count/.test(liveSw),
  'Live must keep 1.3.65 and drop the old Home cache so the phone count fix sits'
);
assert.ok(
  /Version 1\.3\.91-toets/.test(stagingHtml) &&
    /app\.js\?v=1-3-91-toets-lock/.test(stagingHtml) &&
    /1\.3\.91-toets/.test(stagingEnv) &&
    /fire-s-108-70-toets-91/.test(stagingSw),
  'Toets must show 1.3.91-toets so a phone can tell it has dropped 1.3.82-toets'
);

function assertSameCountSource(app, label, alwaysUnion) {
  assert.ok(
    /function unionCloudRows\(left, right\)/.test(app) &&
      /openCount > filteredCount/.test(app) &&
      !/if \(Array\.isArray\(primary\.data\) && primary\.data\.length > 0\) \{\s*return primary;/.test(
        app
      ),
    label + ' must use the larger open/filtered cloud inventory instead of keeping a short 5-row pull'
  );
  if (alwaysUnion) {
    assert.ok(
      /inventoryFailed/.test(app),
      label + ' must always union filtered and open pulls so a phone 5 cannot skip laptop extras'
    );
  } else {
    assert.ok(
      /otherCount > primaryLen/.test(app),
      label + ' must fetch the larger inventory when the short list is incomplete'
    );
  }
  assert.ok(
    /function queueLocalPremisesMissingFromCloud\(/.test(app) &&
      /queueLocalPremisesMissingFromCloud\(/.test(app) &&
      /retry < 4/.test(app),
    label + ' must re-queue laptop-only premises after a complete company pull'
  );
}
assertSameCountSource(liveApp, 'Live', false);
assertSameCountSource(stagingApp, 'Toets', true);

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

async function runAppCases(appSrc, label) {
  const five = rowsFor(5, 'co', 'co-1');
  const extra = rowsFor(3, 'own', null);
  const eight = five.concat(extra);

  const split = loadFetch(appSrc, function spec(args) {
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
  assert.strictEqual(splitResult.error, null, label);
  assert.strictEqual(splitResult.incomplete, false, label);
  assert.strictEqual(
    splitResult.data.length,
    8,
    label + ': phone must pull untagged own rows when the open inventory is larger than the filtered company list'
  );
  assert.strictEqual(splitResult.expectedTotal, 8, label);

  const shortFiltered = loadFetch(appSrc, function spec(args) {
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
    label + ': an incomplete filtered pull of 5 must still take the open inventory of 8'
  );
  assert.strictEqual(recovered.incomplete, false, label);

  const qStart = appSrc.indexOf('function fireSCloudRowInspectionId');
  const qEnd = appSrc.indexOf('function fireSIsLocalProfileFallback');
  assert.ok(qStart > 0 && qEnd > qStart, label + ': missing-cloud queue helper must exist');
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
  vm.runInNewContext(appSrc.slice(qStart, qEnd), queueSandbox);
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
  assert.strictEqual(queuedCount, 3, label);
  assert.deepStrictEqual(queued.sort(), ['own-0', 'own-1', 'own-2']);

  const fStart = appSrc.indexOf('function fireSIsLocalProfileFallback');
  const fEnd = appSrc.indexOf('\nfunction getProjectCloudMetadata');
  const filterSandbox = {
    fireSIsDeletedPremises() {
      return false;
    },
    fireSIsEmptyRecycleLeftoverPremises() {
      return false;
    }
  };
  vm.runInNewContext(appSrc.slice(fStart, fEnd), filterSandbox);
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
    label + ': company Home must keep company rows, own untagged leftovers, and untagged legacy buildings'
  );

  if (label === 'Toets') {
    const fiveOnly = rowsFor(5, 'co', 'co-1');
    const openFail = loadFetch(appSrc, function spec(args) {
      if (!args.filtered) {
        return { data: null, count: null, error: { message: 'timeout' } };
      }
      return {
        data: fiveOnly.slice(args.from, args.to + 1),
        count: fiveOnly.length,
        error: null
      };
    });
    const stalled = await openFail.fetch('user-1');
    assert.strictEqual(
      stalled.incomplete,
      true,
      'Toets: if the open cloud list times out, Home must not finish as 5 while the laptop has 7'
    );
  }
}

(async function run() {
  await runAppCases(liveApp, 'Live');
  await runAppCases(stagingApp, 'Toets');
  console.log('same-building-count.test.js: ok');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
