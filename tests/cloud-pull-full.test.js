'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const stagingHtml = read('staging/index.html');
const liveHtml = read('index.html');
const liveLists = read('fire-s-owner-lists.js');
const stagingLists = read('staging/fire-s-owner-lists.js');
const liveSw = read('service-worker.js');
const stagingSw = read('staging/service-worker.js');

function assertPullSource(app, html, sw, lists, label, appTag, listTag, swFile, swCache) {
  assert.ok(/const pageSizes = \[100, 40, 10, 1\]/.test(app), label + ': pages of 100 with phone fallback');
  assert.ok(/select\('id, updated_at, company_id', \{ count: 'exact' \}\)/.test(app), label + ': cheap inventory count');
  assert.ok(/incomplete: true/.test(app), label + ': incomplete flag');
  assert.ok(
    !/if \(rows\.length\) return \{ data: rows, error: null \}/.test(app),
    label + ': must not pretend a partial pull is complete'
  );
  assert.ok(/Loading inspections…/.test(app), label + ': progress status');
  assert.ok(/fireSCloudPullGeneration/.test(app), label + ': overlapping pulls must not rewind the Home count');
  assert.ok(/fireSCloudPullInFlight/.test(app), label + ': a second cloud pull must not start while one is in flight');
  assert.ok(/incomplete && localBefore > 0/.test(app), label + ': background sync must not flash a loading building count');
  assert.ok(/pullState\.done && !nextDone/.test(lists), label + ': a finished Home count must ignore a later loading flash');
  assert.ok(/fireSSetOwnerListsPullProgress/.test(app), label + ': owner-list progress hook');
  assert.ok(new RegExp('app\\.js\\?v=' + appTag).test(html), label + ': app cache tag');
  assert.ok(new RegExp('fire-s-owner-lists\\.js\\?v=' + listTag).test(html), label + ': owner-list cache tag');
  assert.ok(new RegExp('service-worker\\.js\\?v=' + swFile).test(html), label + ': service worker file tag');
  assert.ok(new RegExp(swCache).test(sw), label + ': service worker cache name');
  assert.ok(/fireSSetOwnerListsPullProgress/.test(lists), label + ': owner-list progress API');
  assert.ok(/Loading buildings…/.test(lists), label + ': loading label');
  assert.ok(!/Still catching up/.test(lists), label + ': Home must not flicker between catching-up and a final count');
}

assertPullSource(
  liveApp,
  liveHtml,
  liveSw,
  liveLists,
  'Live',
  '1-3-58-stats',
  '1-1-stats',
  '108-45-stats',
  'fire-s-108-45-stats'
);
assertPullSource(
  stagingApp,
  stagingHtml,
  stagingSw,
  stagingLists,
  'Toets',
  '1-3-64-filter',
  '1-1-stats',
  '108-41-filter',
  'fire-s-108-41-filter'
);
assert.ok(/function visiblePremises\(list\)/.test(liveApp) && /function visiblePremises\(list\)/.test(stagingApp));
assert.ok(/__fireSHomeCountsFrozen/.test(stagingApp) && /incomplete && freezeHomeCounts/.test(stagingApp));
assert.ok(/__fireSHomeCountsFrozen/.test(stagingLists));
assert.ok(/getVisibleProjectsForCurrentUser\(list\)/.test(liveApp) && /getVisibleProjectsForCurrentUser\(list\)/.test(stagingApp));
assert.ok(
  /fireSIsEmptyRecycleLeftoverPremises\(cloudProject\)/.test(liveApp) &&
    /fireSIsEmptyRecycleLeftoverPremises\(cloudProject\)/.test(stagingApp),
  'Cloud pull must not import empty Recycle leftover premises'
);
assert.ok(
  /!isDeleted\(project\) && !isRecycleLeftover\(project\)/.test(liveLists) &&
    /!isDeleted\(project\) && !isRecycleLeftover\(project\)/.test(stagingLists),
  'Home building count must match Gateway visible premises'
);

function rowsFor(count, prefix) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({
      id: prefix + '-' + i,
      updated_at: '2026-09-08T00:00:00.000Z',
      company_id: 'co-1',
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

async function runFetchCases(appSrc, label) {
  const twelve = rowsFor(12, 'insp');
  const complete = loadFetch(appSrc, function spec(args) {
    return {
      data: twelve.slice(args.from, args.to + 1),
      count: twelve.length,
      error: null
    };
  });
  const chunks = [];
  const completeResult = await complete.fetch('user-1', 'inspection_data, updated_at, company_id', function onChunk(rows, meta) {
    chunks.push({
      n: rows.length,
      total: meta && meta.expectedTotal,
      incomplete: !!(meta && meta.incomplete)
    });
  });
  assert.strictEqual(completeResult.error, null);
  assert.strictEqual(completeResult.incomplete, false);
  assert.strictEqual(completeResult.expectedTotal, 12);
  assert.strictEqual(completeResult.data.length, 12);
  assert.strictEqual(chunks[0].n, 0);
  assert.strictEqual(chunks[0].total, 12);
  assert.strictEqual(chunks[0].incomplete, true);
  assert.strictEqual(chunks[chunks.length - 1].n, 12);
  assert.strictEqual(chunks[chunks.length - 1].incomplete, false);
  assert.ok(
    complete.calls.some(function (call) { return call.isIndex && call.size === 500; }),
    'inventory must use a cheap id page before full inspection_data'
  );
  assert.ok(
    complete.calls.some(function (call) { return !call.isIndex && call.size === 100; }),
    'full rows must start at pages of 100'
  );

  const eighty = rowsFor(80, 'big');
  const shrink = loadFetch(appSrc, function spec(args) {
    if (!args.isIndex && args.size >= 100) {
      return { data: null, count: eighty.length, error: { message: 'payload too large' } };
    }
    return {
      data: eighty.slice(args.from, args.to + 1),
      count: eighty.length,
      error: null
    };
  });
  const shrinkResult = await shrink.fetch('user-1');
  assert.strictEqual(shrinkResult.error, null);
  assert.strictEqual(shrinkResult.incomplete, false);
  assert.strictEqual(shrinkResult.data.length, 80);
  assert.ok(
    shrink.calls.some(function (call) { return !call.isIndex && call.size === 40; }),
    'a failed large page must fall back to 40 rows'
  );

  const partial = rowsFor(80, 'part');
  const broken = loadFetch(appSrc, function spec(args) {
    if (!args.isIndex && args.size >= 100) {
      return { data: null, count: partial.length, error: { message: 'payload too large' } };
    }
    if (!args.isIndex && args.from >= 40) {
      return { data: null, count: partial.length, error: { message: 'network drop' } };
    }
    return {
      data: partial.slice(args.from, args.to + 1),
      count: partial.length,
      error: null
    };
  });
  const brokenResult = await broken.fetch('user-1');
  assert.strictEqual(brokenResult.error, null, 'a mid-pull error must not look like a hard failure');
  assert.strictEqual(brokenResult.incomplete, true, 'a mid-pull error must stay marked incomplete');
  assert.strictEqual(brokenResult.data.length, 40);
  assert.strictEqual(brokenResult.expectedTotal, 80);

  const twenty = rowsFor(20, 'short');
  const shortPage = loadFetch(appSrc, function spec(args) {
    if (!args.isIndex && args.from === 0 && args.size >= 100) {
      return { data: twenty.slice(0, 10), count: twenty.length, error: null };
    }
    return {
      data: twenty.slice(args.from, args.to + 1),
      count: twenty.length,
      error: null
    };
  });
  const shortResult = await shortPage.fetch('user-1');
  assert.strictEqual(shortResult.incomplete, false, label + ': short first page must continue');
  assert.strictEqual(shortResult.data.length, 20, label + ': a short first page must not stop the pull when more rows remain');
}

(async function runFetchTests() {
  await runFetchCases(liveApp, 'Live');
  await runFetchCases(stagingApp, 'Toets');

  const countEl = { textContent: '' };
  const listSandbox = {
    document: {
      readyState: 'complete',
      getElementById(id) {
        if (id === 'fireSOwnerListsCount') return countEl;
        return null;
      },
      addEventListener() {}
    },
    setTimeout() {},
    getProjects() { return []; }
  };
  vm.runInNewContext(liveLists, listSandbox);
  listSandbox.fireSSetOwnerListsPullProgress(0, 124, false);
  assert.strictEqual(countEl.textContent, 'Loading buildings…');
  listSandbox.fireSSetOwnerListsPullProgress(40, 124, false);
  assert.strictEqual(
    countEl.textContent,
    'Loading buildings…',
    'Home must not climb 40, 86, 110 while the pull is still loading'
  );
  listSandbox.fireSSetOwnerListsPullProgress(110, 124, true);
  assert.strictEqual(countEl.textContent, '110 buildings on your inspection list');
  listSandbox.fireSSetOwnerListsPullProgress(86, 124, false);
  assert.strictEqual(
    countEl.textContent,
    '110 buildings on your inspection list',
    'a stale Loading 86 of 124 update must not replace the finished Home count'
  );
  assert.ok(!/ of /.test(countEl.textContent), 'Home must never show an inventory total such as 124');
  listSandbox.fireSSetOwnerListsPullProgress(110, 110, true);
  assert.strictEqual(countEl.textContent, '110 buildings on your inspection list');

  console.log('cloud-pull-full.test.js: ok');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
