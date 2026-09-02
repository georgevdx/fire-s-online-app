'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveEnv = read('fire-s-env.js');
const stagingEnv = read('staging/fire-s-env.js');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveSubscribe = read('fire-s-subscribe.js');
const stagingSubscribe = read('staging/fire-s-subscribe.js');
const liveTerms = read('terms.html');
const stagingTerms = read('staging/terms.html');
const liveManual = read('fire-s-user-manual.js');
const stagingManual = read('staging/fire-s-user-manual.js');
const liveCatalog = read('fire-s-subscriptions.js');
const stagingCatalog = read('staging/fire-s-subscriptions.js');

assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.50'/.test(liveEnv),
  'Live Fire-S must be 1.3.50'
);
assert.ok(/1\.3\.55-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.55-toets');

[liveHtml, stagingHtml].forEach(function (html, i) {
  const name = i === 0 ? 'live' : 'toets';
  assert.ok(
    /id="fireSExpiryReminderRenewBtn"/.test(html) &&
      />Renew</.test(html) &&
      /id="fireSExpiryReminderCancelBtn"/.test(html) &&
      />Cancel subscription</.test(html),
    name + ': Home reminder must offer Renew and Cancel subscription'
  );
});

[liveSubscribe, stagingSubscribe].forEach(function (src, i) {
  const name = i === 0 ? 'live' : 'toets';
  assert.ok(
    /function renewFromReminder\(/.test(src) &&
      /reactivateBilling/.test(src) &&
      /fireSExpiryReminderRenewBtn/.test(src) &&
      /fireSExpiryReminderCancelBtn/.test(src) &&
      /An annual subscription renews automatically until you cancel/.test(src),
    name + ': reminder must renew or cancel, and say annual auto-renews until cancel'
  );
});

assert.ok(
  /REMINDER_DAYS = 7/.test(liveCatalog) && /REMINDER_DAYS = 7/.test(stagingCatalog),
  'Reminder window must be 7 days'
);

assert.ok(
  /Seven days before the expiry date/.test(liveTerms) &&
    /An annual subscription renews automatically until the owner cancels/.test(liveTerms) &&
    /tap Renew/.test(liveTerms) &&
    /Cancel subscription/.test(liveTerms),
  'Live terms must name the 7-day reminder, Renew/Cancel, and annual auto-renew'
);
assert.ok(
  /Seven days before the expiry date/.test(stagingTerms) &&
    /An annual subscription renews automatically until the owner cancels/.test(stagingTerms),
  'Toets terms must name the 7-day reminder and annual auto-renew'
);

assert.ok(
  /Seven days before the expiry date/.test(liveManual) &&
    /<strong>Renew<\/strong>/.test(liveManual) &&
    /An annual subscription renews automatically until you cancel/.test(liveManual)
);
assert.ok(
  /Seven days before the expiry date/.test(stagingManual) &&
    /<strong>Renew<\/strong>/.test(stagingManual)
);

console.log('seven-day-renew-cancel.test.js: ok');
