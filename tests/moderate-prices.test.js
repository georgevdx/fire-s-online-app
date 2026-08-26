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

assert.ok(/1\.3\.28-toets/.test(env), 'Toets-blad version must be 1.3.28-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.27'/.test(liveEnv),
  'Live Fire-S must stay on 1.3.27 until sit dit live'
);

assert.ok(
  /SEAT_PRICE_MONTHLY = 250/.test(catalogSrc) && /SEAT_PRICE_ANNUAL = 2500/.test(catalogSrc),
  'Toets price list must be R250 / R2 500'
);
assert.ok(
  /SEAT_PRICE_MONTHLY = 349/.test(liveCatalog) && /SEAT_PRICE_ANNUAL = 3490/.test(liveCatalog),
  'Live price list must stay R349 / R3 490 until sit dit live'
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
assert.strictEqual(cat.priceLabel('monthly'), 'R250 per subscription per month');
assert.strictEqual(cat.priceLabel('annual'), 'R2 500 per subscription per year');
assert.ok(/R500/.test(cat.bothPriceLines('annual').saveNote), 'Annual must still be 2 months free (save R500)');

assert.ok(
  /R250 per month/.test(html) && /R2 500 per year/.test(html),
  'Toets Subscribe screens must show R250 / R2 500'
);
assert.ok(
  /R250 per month/.test(terms) && /R2 500/.test(terms),
  'Toets terms must show the moderate prices'
);
assert.ok(
  /R349 per month/.test(liveHtml) && /R3 490 per year/.test(liveHtml),
  'Live Subscribe copy must stay R349 until sit dit live'
);
assert.ok(
  /R349 per month/.test(liveTerms) && /R3 490/.test(liveTerms),
  'Live terms must stay R349 until sit dit live'
);

console.log('moderate-prices.test.js: ok');
