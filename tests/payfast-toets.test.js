'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const envSrc = read('staging/fire-s-env.js');
const payfastSrc = read('staging/fire-s-payfast.js');
const catalogSrc = read('staging/fire-s-subscriptions.js');
const html = read('staging/index.html');
const subscribe = read('staging/fire-s-subscribe.js');
const getStarted = read('staging/fire-s-get-started.js');
const liveHtml = read('index.html');
const liveEnv = read('fire-s-env.js');

assert.ok(/1\.3\.35-toets/.test(envSrc), 'Toets-blad version must be 1.3.35-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.29'/.test(liveEnv),
  'Live Fire-S must be 1.3.29 after sit dit live'
);
assert.ok(!/fire-s-payfast\.js/.test(liveHtml), 'Live root must not load PayFast until sit dit live');
assert.ok(/fire-s-payfast\.js/.test(html), 'Toets-blad must load the PayFast module');
assert.ok(/id="fireSPayfastPayBtn"/.test(html), 'Subscription page must have Pay on PayFast');
assert.ok(/PayFast sandbox/.test(html), 'Toets Subscribe copy must say sandbox — no real money');
assert.ok(/startCheckout/.test(getStarted) && /startCheckout/.test(subscribe), 'Subscribe flows must open PayFast');
assert.ok(!/VAT/.test(payfastSrc), 'PayFast module must not mention VAT to subscribers');

const store = {};
const sandbox = {
  window: {},
  console,
  location: {
    protocol: 'https:',
    host: 'georgevdx.github.io',
    hostname: 'georgevdx.github.io',
    pathname: '/fire-s-online-app/staging/',
    search: '',
    href: 'https://georgevdx.github.io/fire-s-online-app/staging/',
    hash: ''
  },
  document: {
    addEventListener: function () {},
    getElementById: function () {
      return null;
    },
    querySelectorAll: function () {
      return [];
    }
  },
  localStorage: {
    getItem: key => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    }
  },
  history: { replaceState: function () {} }
};
sandbox.window = sandbox;

vm.runInNewContext(envSrc, sandbox);
vm.runInNewContext(read('staging/fire-s-md5.js'), sandbox);
vm.runInNewContext(catalogSrc, sandbox);
vm.runInNewContext(payfastSrc, sandbox);

const env = sandbox.FIRE_S_ENV;
const pf = sandbox.fireSPayfast;
assert.ok(env && env.isStaging, 'PayFast tests must run as staging');
assert.ok(pf && pf.isEnabled(), 'Toets-blad PayFast sandbox must be on');
assert.strictEqual(pf.processUrl(), 'https://sandbox.payfast.co.za/eng/process');
assert.strictEqual(pf.md5hex('hello'), '5d41402abc4b2a76b9719d911017c592');
assert.strictEqual(pf.amountFor('monthly'), '250.00');
assert.strictEqual(pf.amountFor('annual'), '2500.00');
assert.strictEqual(pf.payLabel('monthly'), 'Pay R250 on PayFast');
assert.strictEqual(pf.payLabel('annual'), 'Pay R2 500 on PayFast');

const monthly = pf.buildFields({
  kind: 'subscribe',
  company: 'Acme Fire',
  email: 'owner@acme.test',
  interval: 'monthly'
});
assert.strictEqual(monthly.merchant_id, '10000100');
assert.strictEqual(monthly.amount, '250.00');
assert.strictEqual(monthly.recurring_amount, '250.00');
assert.strictEqual(monthly.subscription_type, '1');
assert.strictEqual(monthly.frequency, '3');
assert.strictEqual(monthly.cycles, '0');
assert.ok(monthly.signature && monthly.signature.length === 32);

const unsigned = Object.assign({}, monthly);
delete unsigned.signature;
const param = pf.signatureParamString(unsigned, env.payfast.passphrase);
const expected = crypto.createHash('md5').update(param, 'utf8').digest('hex');
assert.strictEqual(monthly.signature, expected, 'PayFast signature must match PHP-style MD5');

const annual = pf.buildFields({
  kind: 'seat',
  company: 'Acme Fire',
  email: 'owner@acme.test',
  seatEmail: 'inspector@acme.test',
  interval: 'annual'
});
assert.strictEqual(annual.amount, '2500.00');
assert.strictEqual(annual.frequency, '6');
assert.strictEqual(annual.custom_str4, 'seat');
assert.strictEqual(annual.custom_str5, 'inspector@acme.test');

console.log('payfast-toets.test.js: ok');
