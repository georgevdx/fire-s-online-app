'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const env = read('staging/fire-s-env.js');
const html = read('staging/index.html');
const subscribe = read('staging/fire-s-subscribe.js');
const catalogSrc = read('staging/fire-s-subscriptions.js');
const getStarted = read('staging/fire-s-get-started.js');
const roles = read('staging/fire-s-clean-home-roles.js');

assert.ok(/1\.3\.45-toets/.test(env), 'Toets-blad version must be 1.3.45-toets');

const subscribePage = html.match(
  /id="fireSSubscribeSection"[\s\S]*?id="managementDashboardSection"/
);
assert.ok(subscribePage, 'Subscription page must exist');
assert.ok(
  /Subscription per month per login is/.test(subscribePage[0]) &&
    /R250/.test(subscribePage[0]) &&
    /R2 500/.test(subscribePage[0]),
  'Subscription page must say the monthly fee per login'
);
assert.ok(
  !/Inspectors do not pay/.test(subscribePage[0]) &&
    !/Inspectors and other staff do not pay/.test(subscribePage[0]) &&
    !/staff do not pay/.test(subscribePage[0]),
  'Subscription page must not sound as if staff apps are free'
);
assert.ok(
  !/per device/.test(subscribePage[0]),
  'Subscription page must not charge per device (phone and desktop share one login)'
);

const guest = html.match(
  /id="fireSGetStartedGuestFields"[\s\S]*?id="fireSGetStartedCompanyOnly"/
);
assert.ok(
  guest &&
    /Subscription per month per login is R250/.test(guest[0]) &&
    !/Inspectors do not pay/.test(guest[0]),
  'Access Subscribe form must use per-login fees, not free-for-staff copy'
);

assert.ok(
  /Subscription per month per login is/.test(subscribe) &&
    !/Inspectors do not pay/.test(subscribe) &&
    !/Inspectors and other staff do not pay/.test(subscribe) &&
    !/They do not pay/.test(subscribe),
  'Subscribe script must not say inspectors do not pay'
);
assert.ok(
  /Subscription per month per login is R250/.test(getStarted) &&
    /Subscription per month per login is R250/.test(roles),
  'Access and first-day Subscribe copy must use the per-login fee line'
);
assert.ok(!/per device/.test(catalogSrc), 'Price list must not say per device');
assert.ok(
  !/Inspectors do not pay/.test(catalogSrc) &&
    !/Inspectors and other staff do not pay/.test(catalogSrc),
  'Price list shown on Subscribe must not say inspectors do not pay'
);

const store = {};
const sandbox = {
  window: {},
  console,
  localStorage: {
    getItem: key => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    }
  }
};
sandbox.window = sandbox;
vm.runInNewContext(catalogSrc, sandbox);
const cat = sandbox.fireSSubscriptionCatalog;
assert.strictEqual(cat.priceLabel('monthly'), 'R250 per month per login');
assert.strictEqual(cat.priceLabel('annual'), 'R2 500 per year per login');
assert.ok(/R250 per month per login/.test(cat.bothPriceLines('monthly').monthly));
assert.ok(/R2 500 per year per login/.test(cat.bothPriceLines('annual').annual));
assert.ok(/R250/.test(cat.billingNote) && /per login/.test(cat.billingNote));
assert.ok(/Each extra person is another subscription/.test(cat.note));

console.log('subscription-per-login.test.js: ok');
