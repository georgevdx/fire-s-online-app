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
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveStarted = read('fire-s-get-started.js');
const stagingStarted = read('staging/fire-s-get-started.js');
const liveApp = read('app.js');
const stagingApp = read('staging/app.js');

assert.ok(
  storeSrc === stagingStoreSrc,
  'Live and toets must share the same service-request store'
);
assert.ok(
  /fire-s-service-requests\.js/.test(liveHtml) &&
    /fire-s-service-requests\.js/.test(stagingHtml),
  'Access and the app must load the service-request store'
);
assert.ok(
  /fireSSaveServiceRequest/.test(liveStarted) &&
    /fireSSaveServiceRequest/.test(stagingStarted) &&
    /Request saved\. After Login it is under Additional Services/.test(liveStarted) &&
    /Request saved\. After Login it is under Additional Services/.test(stagingStarted) &&
    !/View saved requests/.test(liveHtml) &&
    !/View saved requests/.test(stagingHtml) &&
    !/id="fireSAccessServiceViewBtn"/.test(liveHtml) &&
    !/id="fireSAccessServiceViewBtn"/.test(stagingHtml),
  'Access must save each service request without showing a public saved-request list'
);
assert.ok(
  /fireSSaveServiceRequest/.test(liveApp) &&
    /fireSMergeServiceRequests/.test(liveApp) &&
    /fireSMergeServiceRequests/.test(stagingApp) &&
    /FIRE_S_SERVICE_REQUEST_SUPER_USER = 'georgevdx@gmail.com'/.test(liveApp) &&
    /FIRE_S_SERVICE_REQUEST_SUPER_USER = 'georgevdx@gmail.com'/.test(stagingApp) &&
    /return isServiceRequestSuperUser\(emailOverride\)/.test(liveApp) &&
    /Only <strong>georgevdx@gmail.com<\/strong> can open this list/.test(liveHtml) &&
    /Only <strong>georgevdx@gmail.com<\/strong> can open this list/.test(stagingHtml),
  'View Saved Service Requests is super user only for georgevdx@gmail.com'
);

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
vm.runInNewContext(storeSrc, { window: root, Promise: Promise, Date: Date, Math: Math });

assert.strictEqual(
  root.fireSNormalizeServiceName('Fire consultancy'),
  'Fire Safety Consultancy'
);
assert.strictEqual(
  root.fireSNormalizeServiceName(
    'Fire Plan Assistance (Assist with approval from Local Government)'
  ),
  'Fire Plan Assistance (Assist with approval from Local Government)'
);

function wait(p) {
  return p;
}

Promise.all([
  wait(
    root.fireSSaveServiceRequest({
      service: 'Fire consultancy',
      name: 'A Co',
      email: 'a@example.com',
      message: 'Consult'
    })
  ),
  wait(
    root.fireSSaveServiceRequest({
      service: 'Rational Fire Design Support',
      name: 'B Co',
      phone: '0821111111',
      message: 'Design'
    })
  ),
  wait(
    root.fireSSaveServiceRequest({
      service: 'Fire Plan Assistance (Assist with approval from Local Government)',
      name: 'C Co',
      email: 'c@example.com',
      message: 'Plan'
    })
  )
]).then(function (saved) {
  saved.forEach(function (item) {
    assert.ok(item.ok, 'each of the three services must save');
  });
  const rows = root.fireSListLocalServiceRequests();
  const names = rows.map(function (row) {
    return row.selected_service;
  });
  assert.ok(names.indexOf('Fire Safety Consultancy') >= 0);
  assert.ok(names.indexOf('Rational Fire Design Support') >= 0);
  assert.ok(
    names.indexOf(
      'Fire Plan Assistance (Assist with approval from Local Government)'
    ) >= 0
  );
  const merged = root.fireSMergeServiceRequests([
    {
      id: 'cloud-1',
      selected_service: 'Fire Safety Consultancy',
      client_name: 'Old',
      created_at: '2026-01-01T00:00:00.000Z',
      status: 'new'
    }
  ]);
  assert.ok(merged.length >= 3, 'viewer must keep all three saved services');
  console.log('save-all-service-requests.test.js: ok');
});
