'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const subscribe = read('staging/fire-s-subscribe.js');
const catalogSrc = read('staging/fire-s-subscriptions.js');
const css = read('staging/fire-s-subscribe.css');
const env = read('staging/fire-s-env.js');
const roles = read('staging/fire-s-clean-home-roles.js');
const manual = read('staging/fire-s-user-manual.js');
const liveEnv = read('fire-s-env.js');

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
    /fireSExpiryReminderCloseBtn/.test(html) &&
    /function paintExpiryReminder\(/.test(subscribe) &&
    /fireSPaintExpiryReminder/.test(roles),
  'Owner and Manager Home must show a closable one-month expiry reminder'
);
assert.ok(
  /\.fire-s-expiry-reminder/.test(css),
  'Expiry reminder must be styled so it stands out on Home'
);
assert.ok(
  /2 months free/.test(manual) &&
    /One month before the due date/.test(manual),
  'User manual must mention annual discount and the Home reminder'
);
assert.ok(/1\.3\.[2-9]\d-toets/.test(env), 'Toets-blad version must stay on 1.3.21-toets or newer');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.29'/.test(liveEnv),
  'Live Fire-S must be 1.3.29 after sit dit live'
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
assert.ok(cat && cat.bothPriceLines, 'catalog must expose bothPriceLines');
const lines = cat.bothPriceLines('annual');
assert.ok(/R2 500/.test(lines.annual) && /2 months free/.test(lines.annual));
assert.ok(/R250/.test(lines.monthly));
const monthlyRenews = cat.startBillingPeriod('monthly');
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(monthlyRenews));
assert.ok(
  cat.shouldShowExpiryReminder('monthly'),
  'Monthly due date is about one month away, so the reminder must show'
);
cat.dismissExpiryReminder();
assert.ok(
  !cat.shouldShowExpiryReminder('monthly'),
  'Close must hide the reminder until the next due date'
);

console.log('annual-and-expiry-reminder.test.js: ok');
