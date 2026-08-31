'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const liveHtml = read('index.html');
const subscribe = read('staging/fire-s-subscribe.js');
const liveSubscribe = read('fire-s-subscribe.js');
const catalogSrc = read('staging/fire-s-subscriptions.js');
const liveCatalogSrc = read('fire-s-subscriptions.js');
const css = read('staging/fire-s-subscribe.css');
const liveCss = read('fire-s-subscribe.css');
const env = read('staging/fire-s-env.js');
const liveEnv = read('fire-s-env.js');
const roles = read('staging/fire-s-clean-home-roles.js');
const liveRoles = read('fire-s-clean-home-roles.js');
const manual = read('staging/fire-s-user-manual.js');
const liveManual = read('fire-s-user-manual.js');

assert.ok(
  /Choose monthly or annual · annual is 2 months free/.test(html) &&
    /id="fireSSubscribeBillingWrap"/.test(html),
  'Subscription page must offer monthly and annual with the 2-month discount'
);
assert.ok(
  /billingWrap\.style\.display = ''/.test(subscribe) &&
    !/billingWrap\.style\.display = isSeat \? 'none'/.test(subscribe),
  'Adding a person must still show the monthly / annual choice'
);
assert.ok(
  /2 months free/.test(catalogSrc) &&
    /save R500/.test(catalogSrc) &&
    /bothPriceLines/.test(catalogSrc),
  'Price list must name annual as 2 months free'
);
assert.ok(
  /id="fireSExpiryReminder"/.test(html) &&
    /id="fireSExpiryReminder"/.test(liveHtml) &&
    /fireSExpiryReminderRenewBtn/.test(html) &&
    /fireSExpiryReminderCancelBtn/.test(html) &&
    /fireSExpiryReminderRenewBtn/.test(liveHtml) &&
    /fireSExpiryReminderCancelBtn/.test(liveHtml) &&
    /function paintExpiryReminder\(/.test(subscribe) &&
    /function paintExpiryReminder\(/.test(liveSubscribe) &&
    /function renewFromReminder\(/.test(subscribe) &&
    /function renewFromReminder\(/.test(liveSubscribe) &&
    /fireSPaintExpiryReminder/.test(roles) &&
    /fireSPaintExpiryReminder/.test(liveRoles),
  'Home must show a 7-day reminder with Renew and Cancel subscription'
);
assert.ok(
  !/#fireSExpiryReminder \{\s*display: none !important/.test(css) &&
    /\.fire-s-expiry-reminder\[hidden\]/.test(css) &&
    /\.fire-s-expiry-reminder\[hidden\]/.test(liveCss),
  'Reminder CSS must show when not hidden'
);
assert.ok(
  /2 months free/.test(manual) &&
    /Seven days before the expiry date/.test(manual) &&
    /Seven days before the expiry date/.test(liveManual) &&
    !/One month before the due date/.test(manual) &&
    !/One month before the due date/.test(liveManual),
  'User manual must mention the 7-day reminder, not one month'
);
assert.ok(/1\.3\.[2-9]\d-toets/.test(env), 'Toets-blad version must stay on 1.3.21-toets or newer');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.47'/.test(liveEnv),
  'Live Fire-S must be 1.3.47 after sit dit live'
);

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}
function ymd(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
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
      }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox);
  return { cat: sandbox.fireSSubscriptionCatalog, store };
}

function assertWindow(src, label) {
  const { cat, store } = loadCatalog(src);
  assert.ok(cat && cat.bothPriceLines, label + ': catalog must expose bothPriceLines');
  assert.strictEqual(cat.reminderDays, 7, label + ': reminder window must be 7 days');
  const lines = cat.bothPriceLines('annual');
  assert.ok(/R2 500/.test(lines.annual) && /2 months free/.test(lines.annual));
  assert.ok(/R250/.test(lines.monthly));
  const monthlyRenews = cat.startBillingPeriod('monthly');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(monthlyRenews));
  assert.ok(
    !cat.shouldShowExpiryReminder('monthly'),
    label + ': a monthly due date about one month away must not remind yet'
  );
  store['fireS.billingRenewsOn'] = ymd(8);
  assert.ok(!cat.shouldShowExpiryReminder('monthly'), label + ': 8 days away must not remind');
  store['fireS.billingRenewsOn'] = ymd(7);
  assert.ok(cat.shouldShowExpiryReminder('monthly'), label + ': 7 days before expiry must remind');
  store['fireS.billingRenewsOn'] = ymd(0);
  assert.ok(cat.shouldShowExpiryReminder('monthly'), label + ': due today must remind');
  cat.dismissExpiryReminder();
  assert.ok(
    !cat.shouldShowExpiryReminder('monthly'),
    label + ': Close must hide the reminder until the next due date'
  );
  cat.markPaid('annual');
  store['fireS.billingRenewsOn'] = ymd(3);
  cat.cancelBilling();
  assert.ok(!cat.shouldShowExpiryReminder('annual'), label + ': cancelled must not remind');
}

assertWindow(catalogSrc, 'toets');
assertWindow(liveCatalogSrc, 'live');

console.log('annual-and-expiry-reminder.test.js: ok');
