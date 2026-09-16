'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
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

assert.ok(/1\.3\.80-toets/.test(envSrc), 'Toets-blad version must be 1.3.80-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.65'/.test(liveEnv),
  'Live Fire-S must be 1.3.65 after sit dit live'
);
assert.ok(!/fire-s-payfast\.js/.test(liveHtml), 'Live root must not load PayFast until sit dit live');
assert.ok(/fire-s-payfast\.js/.test(html), 'Toets-blad must load the PayFast module');
assert.ok(/id="fireSPayfastPayBtn"/.test(html), 'Subscription page must have Pay on PayFast');
assert.ok(/PayFast sandbox/.test(html), 'Toets Subscribe copy must say sandbox — no real money');
assert.ok(/startCheckout/.test(getStarted) && /startCheckout/.test(subscribe), 'Subscribe flows must open PayFast');
assert.ok(!/VAT/.test(payfastSrc), 'PayFast module must not mention VAT to subscribers');

assert.ok(!/merchantKey/.test(envSrc), 'Toets env must not ship a merchant key');
assert.ok(!/passphrase\s*:/.test(envSrc), 'Toets env must not ship a PayFast passphrase');
assert.ok(!/merchant_key/.test(payfastSrc), 'PWA PayFast module must not post merchant_key itself');
assert.ok(/functions\/v1/.test(payfastSrc), 'Checkout must call the Edge Function');
assert.ok(!/generateSignature/.test(payfastSrc), 'Browser must not sign PayFast requests');
const fetchBody = payfastSrc.match(/body:\s*JSON\.stringify\(\{[\s\S]*?\}\)/);
assert.ok(fetchBody, 'Checkout POST body must exist');
assert.ok(!/amount/.test(fetchBody[0]), 'Browser must not send a price');
assert.ok(!/companyId/.test(fetchBody[0]), 'Browser must not send company_id as authority');
assert.ok(!/mPaymentId/.test(fetchBody[0]), 'Browser must not send the payment reference');

const store = {};
const sandbox = {
  window: {},
  console,
  fetch: async function () {
    throw new Error('fetch should not run in unit enablement checks');
  },
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
vm.runInNewContext(catalogSrc, sandbox);
vm.runInNewContext(payfastSrc, sandbox);

const env = sandbox.FIRE_S_ENV;
const pf = sandbox.fireSPayfast;
assert.ok(env && env.isStaging, 'PayFast tests must run as staging');
assert.ok(pf && pf.isEnabled(), 'Toets-blad PayFast sandbox must be on');
assert.strictEqual(env.payfast.mode, 'sandbox');
assert.ok(!env.payfast.merchantKey && !env.payfast.passphrase);
assert.strictEqual(pf.processUrl(), 'https://sandbox.payfast.co.za/eng/process');
assert.strictEqual(pf.amountFor('monthly'), '250.00');
assert.strictEqual(pf.amountFor('annual'), '2500.00');
assert.strictEqual(pf.payLabel('monthly'), 'Pay R250 on PayFast');
assert.strictEqual(pf.payLabel('annual'), 'Pay R2 500 on PayFast');
assert.ok(
  /\/functions\/v1\/payfast-checkout$/.test(pf.checkoutUrl()),
  'Checkout URL must be the staging Edge Function'
);

console.log('payfast-toets.test.js: ok');
