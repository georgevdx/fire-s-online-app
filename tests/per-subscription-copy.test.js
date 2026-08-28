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
const subscribe = read('staging/fire-s-subscribe.js');
const notify = read('staging/fire-s-subscribe-notify.js');
const getStarted = read('staging/fire-s-get-started.js');
const roles = read('staging/fire-s-clean-home-roles.js');
const manual = read('staging/fire-s-user-manual.js');
const terms = read('staging/terms.html');
const privacy = read('staging/privacy.html');
const liveCatalog = read('fire-s-subscriptions.js');
const liveHtml = read('index.html');

assert.ok(/1\.3\.42-toets/.test(env), 'Toets-blad version must stay on 1.3.42-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.36'/.test(liveEnv),
  'Live Fire-S must be 1.3.36 after sit dit live'
);

const priceFiles = [html, catalogSrc, subscribe, notify, getStarted, roles, manual, terms, privacy];
priceFiles.forEach(function (src, i) {
  const names = [
    'index.html',
    'fire-s-subscriptions.js',
    'fire-s-subscribe.js',
    'fire-s-subscribe-notify.js',
    'fire-s-get-started.js',
    'fire-s-clean-home-roles.js',
    'fire-s-user-manual.js',
    'terms.html',
    'privacy.html'
  ];
  assert.ok(
    !/R349 per email/.test(src) &&
      !/R3 490 per email/.test(src) &&
      !/per email per (month|year)/.test(src) &&
      !/\/ month per email/.test(src),
    names[i] + ': toets price lines must not say R### per email'
  );
});

assert.ok(
  /Subscription per month per login is R250/.test(html) &&
    /Per year per login is R2 500/.test(html),
  'Access Subscribe form must say R250 per month per login'
);
assert.ok(
  !/you pay R250 per subscription · staff never Subscribe/.test(html),
  'Access choice list must not advertise the fee to inspectors'
);
assert.ok(
  /Each new email is a new subscription/.test(html) &&
    /Use the same email on phone and desktop/.test(html),
  'Login identity copy must still say one email is one login'
);
assert.ok(
  /do not enter the same email twice/.test(manual),
  'User manual must still warn not to enter the same email twice'
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
assert.ok(cat && cat.priceLabel && cat.bothPriceLines, 'catalog must expose price labels');
assert.strictEqual(cat.priceLabel('monthly'), 'R250 per month per login');
assert.strictEqual(cat.priceLabel('annual'), 'R2 500 per year per login');
const lines = cat.bothPriceLines('monthly');
assert.ok(/R250 per month per login/.test(lines.monthly), 'monthly picker must say per login');
assert.ok(/R2 500 per year per login/.test(lines.annual), 'annual picker must say per login');
assert.ok(!/per email/.test(lines.monthly + lines.annual), 'picker price lines must not say per email');
assert.ok(!/per device/.test(lines.monthly + lines.annual), 'picker price lines must not say per device');
assert.ok(
  /per login/.test(cat.note) && /Each extra person is another subscription/.test(cat.note),
  'catalog note must price per login and keep extra-person billing'
);

assert.ok(
  !/Company S/.test(terms) &&
    !/Company-S/.test(terms) &&
    !/Company S/.test(privacy) &&
    !/Company-S/.test(privacy),
  'Toets terms and privacy must not name Company S; Fire-S is the app identity'
);
assert.ok(/Fire-S invoices the owner/.test(terms), 'Toets terms must still say Fire-S invoices the owner');
assert.ok(
  /R349 per subscription/.test(liveCatalog) &&
    /R349 per subscription/.test(liveHtml) &&
    !/R349 per email/.test(liveCatalog) &&
    !/R349 per email/.test(liveHtml),
  'Live root must say R349 per subscription after sit dit live'
);
assert.ok(
  !/Company S/.test(read('terms.html')) &&
    !/Company-S/.test(read('terms.html')) &&
    !/Company S/.test(read('privacy.html')) &&
    !/Company-S/.test(read('privacy.html')),
  'Live terms and privacy must name Fire-S, not Company S'
);

console.log('per-subscription-copy.test.js: ok');
