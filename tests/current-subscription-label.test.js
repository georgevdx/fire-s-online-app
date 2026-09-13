'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function loadCatalog(src) {
  const store = {};
  const sandbox = {
    window: {},
    console,
    localStorage: {
      getItem: key => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
      setItem: (key, value) => {
        store[key] = String(value);
      },
      removeItem: key => {
        delete store[key];
      }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox);
  return { cat: sandbox.fireSSubscriptionCatalog, store };
}

function assertPaintSource(label, src) {
  assert.ok(
    /Current subscription/.test(src) &&
      /currentSubscriptionSummary/.test(src) &&
      /fire-s-subscribe-current-kicker/.test(src) &&
      !/Chosen:/.test(src),
    label + ': Subscription page must paint only the current subscription, not Chosen: both prices'
  );
}

assertPaintSource('Live subscribe', read('fire-s-subscribe.js'));
assertPaintSource('Toets subscribe', read('staging/fire-s-subscribe.js'));

['fire-s-subscriptions.js', 'staging/fire-s-subscriptions.js'].forEach(function (name) {
  const src = read(name);
  assert.ok(
    /function currentSubscriptionSummary\(/.test(src) &&
      /currentSubscriptionSummary: currentSubscriptionSummary/.test(src),
    name + ': catalog must expose currentSubscriptionSummary'
  );
});

const live = loadCatalog(read('fire-s-subscriptions.js'));
assert.ok(live.cat.currentSubscriptionSummary, 'live catalog must expose currentSubscriptionSummary');
live.cat.rememberInterval('monthly');
live.cat.markPaid('monthly');
const liveActive = live.cat.currentSubscriptionSummary();
assert.strictEqual(liveActive.heading, 'Current subscription');
assert.ok(/Monthly/.test(liveActive.title) && /R250/.test(liveActive.title), 'live active title must name Monthly R250');
assert.ok(/^Active/.test(liveActive.detail), 'live active detail must start with Active');
assert.strictEqual(liveActive.interval, 'monthly');

live.cat.cancelBilling();
const liveCancelled = live.cat.currentSubscriptionSummary();
assert.ok(/^Cancelled/.test(liveCancelled.detail), 'live cancelled detail must start with Cancelled');
assert.ok(/Monthly/.test(liveCancelled.title), 'cancelled summary must still name the last plan');

const unpaid = loadCatalog(read('fire-s-subscriptions.js'));
const none = unpaid.cat.currentSubscriptionSummary();
assert.strictEqual(none.title, 'None yet');
assert.ok(/Not paid yet/.test(none.detail), 'unpaid summary must say none yet');

const toets = loadCatalog(read('staging/fire-s-subscriptions.js'));
toets.cat.rememberInterval('annual');
toets.cat.markPaid('annual');
const toetsActive = toets.cat.currentSubscriptionSummary();
assert.ok(/Annual/.test(toetsActive.title) && /R2 500/.test(toetsActive.title), 'toets active title must name Annual R2 500');
assert.ok(/^Active/.test(toetsActive.detail), 'toets active detail must start with Active');

assert.ok(
  /\.fire-s-subscribe-current-kicker/.test(read('fire-s-subscribe.css')) &&
    /\.fire-s-subscribe-current-kicker/.test(read('staging/fire-s-subscribe.css')),
  'Current subscription kicker must be styled on live and toets'
);

assert.ok(
  /fire-s-subscribe\.js\?v=1-15-current/.test(read('index.html')) &&
    /fire-s-subscribe\.css\?v=1-7-current/.test(read('index.html')),
  'Live must cache-bust the current-subscription paint'
);
assert.ok(
  /fire-s-subscribe\.js\?v=1-18-current/.test(read('staging/index.html')) &&
    /fire-s-subscribe\.css\?v=1-9-current/.test(read('staging/index.html')),
  'Toets must cache-bust the current-subscription paint'
);

assert.ok(
  /Version 1\.3\.65/.test(read('index.html')) &&
    /Version 1\.3\.78-toets/.test(read('staging/index.html')),
  'Displayed versions stay 1.3.65 live and 1.3.78-toets'
);

console.log('current-subscription-label.test.js: ok');
