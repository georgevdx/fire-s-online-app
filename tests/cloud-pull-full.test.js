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
const stagingLists = read('staging/fire-s-owner-lists.js');
const stagingSw = read('staging/service-worker.js');

assert.ok(/const pageSize = 6/.test(liveApp), 'Live pull must stay on pages of 6 until sit-live');
assert.ok(
  /if \(rows\.length\) return \{ data: rows, error: null \}/.test(liveApp),
  'Live still treats a mid-pull error as a complete list'
);
assert.ok(/app\.js\?v=1-3-58-place/.test(liveHtml), 'Live cache tag must stay 1-3-58-place');

assert.ok(/const pageSizes = \[100, 40, 10, 1\]/.test(stagingApp));
assert.ok(/select\('id, updated_at, company_id', \{ count: 'exact' \}\)/.test(stagingApp));
assert.ok(/incomplete: true/.test(stagingApp));
assert.ok(
  !/if \(rows\.length\) return \{ data: rows, error: null \}/.test(stagingApp),
  'Toets-blad must not pretend a partial pull is complete'
);
assert.ok(/Loading inspections…/.test(stagingApp));
assert.ok(/Still catching up/.test(stagingApp));
assert.ok(/fireSSetOwnerListsPullProgress/.test(stagingApp));
assert.ok(/app\.js\?v=1-3-64-pull/.test(stagingHtml));
assert.ok(/fire-s-owner-lists\.js\?v=1-1-pull/.test(stagingHtml));
assert.ok(/service-worker\.js\?v=108-35-pull/.test(stagingHtml));
assert.ok(/fire-s-108-35-pull/.test(stagingSw));
assert.ok(/fireSSetOwnerListsPullProgress/.test(stagingLists));
assert.ok(/Loading buildings…/.test(stagingLists));
assert.ok(/Still catching up/.test(stagingLists));

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

function loadFetch(spec) {
  const start = stagingApp.indexOf('function applyInspectionAccessFilter');
  const end = stagingApp.indexOf('function applyInspectionDeleteFilter');
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
  vm.runInNewContext(stagingApp.slice(start, end), sandbox);
  return { fetch: sandbox.fetchCompanyInspectionsFromCloud, calls: calls };
}

(async function runFetchTests() {
  const twelve = rowsFor(12, 'insp');
  const complete = loadFetch(function spec(args) {
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
  const shrink = loadFetch(function spec(args) {
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
  const broken = loadFetch(function spec(args) {
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
  const shortPage = loadFetch(function spec(args) {
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
  assert.strictEqual(shortResult.incomplete, false);
  assert.strictEqual(shortResult.data.length, 20, 'a short first page must not stop the pull when more rows remain');

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
  vm.runInNewContext(stagingLists, listSandbox);
  listSandbox.fireSSetOwnerListsPullProgress(0, 124, false);
  assert.strictEqual(countEl.textContent, 'Loading 124 buildings…');
  listSandbox.fireSSetOwnerListsPullProgress(40, 124, false);
  assert.strictEqual(countEl.textContent, 'Loading buildings… 40 of 124');
  listSandbox.fireSSetOwnerListsPullProgress(40, 124, true);
  assert.strictEqual(countEl.textContent, '40 of 124 buildings loaded. Still catching up.');
  listSandbox.fireSSetOwnerListsPullProgress(124, 124, true);
  assert.strictEqual(countEl.textContent, '124 buildings on your inspection list');

  console.log('cloud-pull-full.test.js: ok');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
