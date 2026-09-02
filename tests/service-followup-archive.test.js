'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const storeSrc = read('fire-s-service-requests.js');
const stagingStoreSrc = read('staging/fire-s-service-requests.js');
const stagingHtml = read('staging/index.html');
const stagingApp = read('staging/app.js');
const stagingEnv = read('staging/fire-s-env.js');

assert.ok(
  storeSrc === stagingStoreSrc,
  'Live and toets must share the same service-request store'
);
assert.ok(/1\.3\.56-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.56-toets');
assert.ok(
  /app\.js\?v=1-3-56-archive/.test(stagingHtml) &&
    /fire-s-env\.js\?v=1-3-56-toets/.test(stagingHtml) &&
    /fire-s-service-requests\.js\?v=1-2-archive/.test(stagingHtml),
  'Toets-blad must cache-bust the archive follow-up files'
);
assert.ok(
  /id="viewSupportArchiveBtn"/.test(stagingHtml) &&
    /Request \/ issue archive/.test(stagingHtml) &&
    /id="supportArchiveList"/.test(stagingHtml) &&
    /stay here for 6 months/.test(stagingHtml),
  'Services / Support must show a 6-month request/issue archive'
);
assert.ok(
  /function hideSupportAdminPanels/.test(stagingApp) &&
    /hideSupportAdminPanels\('serviceRequestsList'\)/.test(stagingApp) &&
    /hideSupportAdminPanels\('betaFeedbackList'\)/.test(stagingApp) &&
    /hideSupportAdminPanels\('supportArchiveList'\)/.test(stagingApp) &&
    /supportAdminPanelIsOpen\('serviceRequestsList'\) && !forceOpen/.test(stagingApp) &&
    /supportAdminPanelIsOpen\('betaFeedbackList'\) && !forceOpen/.test(stagingApp),
  'Saved requests, reported issues and archive must open one at a time'
);
assert.ok(
  /fireSMarkServiceRequestFollowedUp/.test(stagingApp) &&
    /await renderServiceRequestsList\(true\)/.test(stagingApp) &&
    /function renderSupportArchiveList/.test(stagingApp) &&
    /purgeExpiredSupportArchiveCloud/.test(stagingApp) &&
    /filter\(item => !isArchivedSupportIssue\(item\)\)/.test(stagingApp),
  'Followed-up requests must leave the active list and closed issues must move to archive'
);

(function exclusivePanels() {
  const start = stagingApp.indexOf('const SUPPORT_ADMIN_PANEL_IDS = [');
  const end = stagingApp.indexOf('function isArchivedSupportIssue');
  assert.ok(start >= 0 && end > start, 'exclusive panel helpers must exist');
  const els = {};
  function makeEl() {
    return {
      style: { display: 'none' },
      innerHTML: 'open',
      className: '',
      classList: {
        add: function (name) {
          this._el.className = name;
        },
        remove: function () {
          this._el.className = '';
        }
      }
    };
  }
  ['serviceRequestsList', 'betaFeedbackList', 'supportArchiveList'].forEach(function (id) {
    const el = makeEl();
    el.classList._el = el;
    els[id] = el;
  });
  ['viewServiceRequestsBtn', 'viewBetaFeedbackBtn', 'viewSupportArchiveBtn'].forEach(function (id) {
    const el = makeEl();
    el.classList._el = el;
    els[id] = el;
  });
  els.serviceRequestsList.style.display = 'block';
  els.serviceRequestsList.innerHTML = 'requests';
  const sandbox = {
    document: {
      getElementById: function (id) {
        return els[id] || null;
      }
    }
  };
  vm.runInNewContext(stagingApp.slice(start, end), sandbox);
  sandbox.hideSupportAdminPanels('betaFeedbackList');
  assert.strictEqual(els.serviceRequestsList.style.display, 'none');
  assert.strictEqual(els.serviceRequestsList.innerHTML, '');
  assert.strictEqual(els.supportArchiveList.style.display, 'none');
  assert.strictEqual(els.viewBetaFeedbackBtn.className, 'is-open');
  assert.strictEqual(els.viewServiceRequestsBtn.className, '');
})();

const memory = { store: null };
const root = {
  localStorage: {
    getItem: function (key) {
      return key === 'fireS.serviceRequests.v1' ? memory.store : null;
    },
    setItem: function (key, value) {
      if (key === 'fireS.serviceRequests.v1') memory.store = value;
    }
  }
};
vm.runInNewContext(storeSrc, {
  window: root,
  Promise: Promise,
  Date: Date,
  Math: Math
});

function monthsAgo(count) {
  const date = new Date();
  date.setMonth(date.getMonth() - count);
  return date.toISOString();
}

root
  .fireSSaveServiceRequest({
    service: 'Fire consultancy',
    name: 'Follow Co',
    email: 'follow@example.com',
    message: 'Please quote'
  })
  .then(function (saved) {
    assert.ok(saved.ok, 'request must save');
    const id = saved.row.id;
    assert.strictEqual(root.fireSListLocalServiceRequests().length, 1);

    const marked = root.fireSMarkServiceRequestFollowedUp(
      { id: id },
      { followup_note: 'Called the client' }
    );
    assert.ok(marked, 'Mark as Followed up must update this phone copy');
    assert.strictEqual(
      root.fireSListLocalServiceRequests().length,
      0,
      'Followed-up request must leave the active list'
    );
    const archived = root.fireSListLocalArchivedServiceRequests();
    assert.strictEqual(archived.length, 1);
    assert.strictEqual(archived[0].status, 'followed_up');
    assert.strictEqual(archived[0].followup_note, 'Called the client');

    const merged = root.fireSMergeServiceRequests([
      {
        id: 'cloud-dup',
        selected_service: 'Fire Safety Consultancy',
        client_name: 'Follow Co',
        client_email: 'follow@example.com',
        message: 'Please quote',
        created_at: saved.row.created_at,
        status: 'new'
      }
    ]);
    assert.strictEqual(
      merged.length,
      0,
      'Local followed-up copy must not come back through merge'
    );

    const followedCloud = root.fireSMergeServiceRequests([
      {
        id: 'cloud-old',
        selected_service: 'Rational Fire Design Support',
        client_name: 'Old Co',
        status: 'followed_up',
        created_at: '2026-01-01T00:00:00.000Z'
      }
    ]);
    assert.strictEqual(followedCloud.length, 0, 'Cloud followed-up rows stay off the active list');

    memory.store = JSON.stringify([
      {
        id: 'keep-archive',
        selected_service: 'Fire Safety Consultancy',
        client_name: 'Keep Co',
        status: 'followed_up',
        followed_up_at: monthsAgo(2),
        created_at: monthsAgo(2)
      },
      {
        id: 'drop-archive',
        selected_service: 'Fire Safety Consultancy',
        client_name: 'Drop Co',
        status: 'followed_up',
        followed_up_at: monthsAgo(7),
        created_at: monthsAgo(7)
      }
    ]);
    const stillKept = root.fireSListLocalArchivedServiceRequests();
    const ids = stillKept.map(function (row) {
      return row.id;
    });
    assert.ok(ids.indexOf('keep-archive') >= 0, 'Archive must keep items younger than 6 months');
    assert.ok(ids.indexOf('drop-archive') < 0, 'Archive must delete items older than 6 months');
    assert.ok(root.fireSSupportArchiveMonths === 6);

    const closed = { status: 'closed', followed_up_at: monthsAgo(7) };
    assert.ok(root.fireSIsClosedSupportIssue(closed));
    assert.ok(root.fireSIsExpiredSupportArchive(closed));

    console.log('service-followup-archive.test.js: ok');
  })
  .catch(function (error) {
    console.error(error);
    process.exit(1);
  });
