'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function checkTree(dir) {
  const file = (name) => (dir === '.' ? name : path.join(dir, name));
  const label = dir === '.' ? 'live root' : 'toets-blad';
  const html = read(file('index.html'));
  const notify = read(file('fire-s-subscribe-notify.js'));
  const team = read(file('fire-s-company-team.js'));
  const catalog = read(file('fire-s-subscriptions.js'));
  const terms = read(file('terms.html'));
  const privacy = read(file('privacy.html'));

  if (dir === 'staging') {
    assert.ok(
      /Each extra person is another subscription/.test(html) &&
        /Each new email is a new subscription/.test(html),
      label + ': Subscribe copy must price each extra person; Personnel must still say each new email'
    );
    assert.ok(
      /per month per login/.test(catalog) && /Each extra person is another subscription/.test(catalog),
      label + ': price list must say per login, not that staff apps are free'
    );
    assert.ok(
      !/Inspectors do not pay/.test(catalog) && !/Inspectors and other staff do not pay/.test(html.match(/id="fireSSubscribeSection"[\s\S]*?id="managementDashboardSection"/)[0]),
      label + ': Subscription page must not say inspectors do not pay'
    );
  } else {
    assert.ok(
      /Inspectors and other staff do not pay/.test(html) &&
        /Each new email is a new subscription/.test(html),
      label + ': Subscribe and Personnel copy must say the owner pays for each new email'
    );
    assert.ok(
      /The owner pays/.test(catalog) && /Inspectors do not pay/.test(catalog),
      label + ': price list must say the owner pays'
    );
  }
  assert.ok(
    !/Inspector, Manager, Owner and Viewer pay the same/.test(html),
    label + ': app must not say inspectors pay the same as the owner'
  );
  assert.ok(
    /billed_to/.test(notify) &&
      /Invoice the owner/.test(notify) &&
      /Inspectors and other staff do not pay/.test(notify),
    label + ': Company S notify must invoice the owner, not the inspector'
  );
  assert.ok(
    /function notifyOwnerPaysSubscription\(/.test(team) &&
      /billedTo: ownerBillingEmail\(\)/.test(team),
    label + ': adding personnel must start a new subscription billed to the owner'
  );
  assert.ok(
    /Inspectors and other staff do not pay/.test(terms) &&
      /starts a new subscription for that email/.test(terms),
    label + ': terms must invoice the owner for each new email'
  );
  assert.ok(
    /The owner who subscribes, and who adds personnel, pays/.test(privacy),
    label + ': privacy must say the owner pays and inspectors do not'
  );
}

const sandbox = { window: {}, console };
sandbox.window = sandbox;
vm.runInNewContext(read('staging/fire-s-subscribe-notify.js'), sandbox);

const subscribeBody = sandbox.fireSNotifyCompanySBuildBody({
  kind: 'subscribe',
  company: 'Acme Fire',
  email: 'owner@acme.test',
  billedTo: 'owner@acme.test',
  role: 'Owner',
  interval: 'monthly'
});
assert.strictEqual(subscribeBody.billed_to, 'owner@acme.test');
assert.ok(/Invoice this owner/.test(subscribeBody.note), 'Subscribe notify must invoice the owner');

const seatBody = sandbox.fireSNotifyCompanySBuildBody({
  kind: 'seat',
  company: 'Acme Fire',
  email: 'inspector@acme.test',
  billedTo: 'owner@acme.test',
  role: 'Inspector',
  interval: 'annual'
});
assert.strictEqual(seatBody.billed_to, 'owner@acme.test');
assert.strictEqual(seatBody.person_email, 'inspector@acme.test');
assert.ok(
  /new subscription/.test(String(seatBody.event).toLowerCase()),
  'Each new personnel email must be a new subscription'
);
assert.ok(
  /Invoice the owner/.test(seatBody.note) && /not the inspector/.test(seatBody.note),
  'Personnel subscription must tell Company S to invoice the owner, not the inspector'
);
assert.ok(
  /Inspectors and other staff do not pay/.test(seatBody.pay_how),
  'Invoice mail must say inspectors do not pay'
);
assert.ok(
  !/Add this email to the next Company S invoice/.test(seatBody.note),
  'A new email must not be treated as a silent add-on to an old invoice line'
);

checkTree('staging');
const liveNotify = read('fire-s-subscribe-notify.js');
if (/billed_to/.test(liveNotify)) {
  checkTree('.');
} else {
  const liveEnv = read('fire-s-env.js');
  assert.ok(
    /1\.3\.14/.test(liveEnv),
    'Live Fire-S must be 1.3.14 after sit dit live'
  );
}

const toetsEnv = read('staging/fire-s-env.js');
assert.ok(
  /1\.3\.(1[4-9]|[2-9]\d)-toets/.test(toetsEnv),
  'Toets-blad must stay on 1.3.14-toets or newer with owner-pays copy'
);

console.log('owner-pays-seats.test.js: ok');
