'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveNotify = read('fire-s-subscribe-notify.js');
const stagingNotify = read('staging/fire-s-subscribe-notify.js');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');

assert.ok(
  /function notifyServiceRequest\(/.test(liveNotify) &&
    /function notifyServiceRequest\(/.test(stagingNotify) &&
    /Fire-S: additional service request/.test(liveNotify) &&
    /root\.fireSNotifyServiceRequest = notifyServiceRequest/.test(liveNotify),
  'Live and toets must email a guest Additional services request'
);
assert.ok(
  /notifyCompanyS === false/.test(
    liveNotify.slice(liveNotify.indexOf('function notifyServiceRequest'))
  ),
  'Guest service-request mail must stay off on the toets-blad'
);

function loadNotify(src) {
  const root = {};
  vm.runInNewContext(src, { window: root });
  return root;
}

const live = loadNotify(liveNotify);
const body = live.fireSNotifyServiceRequestBuildBody({
  service: 'Fire Plan Assistance (Assist with approval from Local Government)',
  name: 'Test Co',
  phone: '0820000000',
  email: 'owner@example.com',
  message: 'Need plan help'
});
assert.strictEqual(
  body._subject,
  'Fire-S: additional service request — Fire Plan Assistance (Assist with approval from Local Government)'
);
assert.strictEqual(
  body.service,
  'Fire Plan Assistance (Assist with approval from Local Government)'
);

assert.ok(
  /data-service="Fire Plan Assistance \(Assist with approval from Local Government\)/.test(
    liveHtml
  ) &&
    /data-service="Fire Plan Assistance \(Assist with approval from Local Government\)/.test(
      stagingHtml
    ),
  'Logged-in Additional Services must include Fire Plan Assistance'
);

console.log('access-extra-services.test.js: ok');
