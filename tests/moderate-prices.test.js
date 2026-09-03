'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const env = read('staging/fire-s-env.js');
const liveEnv = read('fire-s-env.js');
const html = read('staging/index.html');
const catalogSrc = read('staging/fire-s-subscriptions.js');
const liveCatalog = read('fire-s-subscriptions.js');
const liveHtml = read('index.html');
const terms = read('staging/terms.html');
const liveTerms = read('terms.html');

assert.ok(/1\.3\.60-toets/.test(env), 'Toets-blad version must be 1.3.60-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.54'/.test(liveEnv),
  'Live Fire-S must be 1.3.54 after sit dit live'
);

assert.ok(
  /SEAT_PRICE_MONTHLY = 250/.test(catalogSrc) && /SEAT_PRICE_ANNUAL = 2500/.test(catalogSrc),
  'Toets price list must be R250 / R2 500'
);
assert.ok(
  /SEAT_PRICE_MONTHLY = 250/.test(liveCatalog) && /SEAT_PRICE_ANNUAL = 2500/.test(liveCatalog),
  'Live price list must be R250 / R2 500'
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
assert.ok(/R500/.test(cat.bothPriceLines('annual').saveNote), 'Annual must still be 2 months free (save R500)');

assert.ok(
  /per month per login is R250/.test(html) && /Per year per login is R2 500/.test(html),
  'Toets Subscribe screens must show R250 / R2 500 per login'
);
assert.ok(
  /R250 per month/.test(terms) && /R2 500/.test(terms),
  'Toets terms must show the moderate prices'
);
assert.ok(
  /R250 per month/.test(liveHtml) && /R2 500 per year/.test(liveHtml),
  'Live Subscribe copy must show R250 / R2 500'
);
assert.ok(
  /R250 per month/.test(liveTerms) && /R2 500/.test(liveTerms),
  'Live terms must show R250 / R2 500'
);

const subscriberFacing = [
  html,
  read('staging/fire-s-subscribe.js'),
  read('staging/fire-s-subscriptions.js'),
  read('staging/fire-s-user-manual.js'),
  terms,
  read('staging/privacy.html')
];
subscriberFacing.forEach(function (src, i) {
  assert.ok(
    !/VAT/.test(src) && !/No VAT/.test(src),
    'Subscriber-facing copy must not explain VAT or fees: file ' + i
  );
});
assert.ok(
  /PayFast VAT is PayFast/.test(read('staging/fire-s-subscribe-notify.js')),
  'Internal invoice note may remind that PayFast VAT is PayFast’s, not the subscriber’s'
);

console.log('moderate-prices.test.js: ok');
