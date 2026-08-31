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
const css = read('staging/fire-s-subscribe.css');
const subscribe = read('staging/fire-s-subscribe.js');
const catalogSrc = read('staging/fire-s-subscriptions.js');
const payfast = read('staging/fire-s-payfast.js');
const team = read('staging/fire-s-company-team.js');
const terms = read('staging/terms.html');
const manual = read('staging/fire-s-user-manual.js');
const liveHtml = read('index.html');
const liveEnv = read('fire-s-env.js');

assert.ok(/1\.3\.47-toets/.test(env), 'Toets-blad version must be 1.3.47-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.42'/.test(liveEnv),
  'Live Fire-S must be 1.3.42 after sit dit live'
);
assert.ok(!/fireSSubscribeCancelBtn/.test(liveHtml), 'Live root must not gain cancel UI until sit dit live');

const page = html.match(/id="fireSSubscribeSection"[\s\S]*?id="managementDashboardSection"/);
assert.ok(page, 'Subscription page must exist');
assert.ok(
  /id="fireSSubscribeStatus"/.test(page[0]) &&
    /id="fireSSubscribeCancelPanel"/.test(page[0]) &&
    /Only the Owner can cancel/.test(page[0]) &&
    /Tap <strong>Cancel subscription<\/strong>/.test(page[0]) &&
    /company name and inspections stay/.test(page[0]),
  'Owner must see active-status copy and numbered cancel steps on Subscription'
);
assert.ok(
  /A manager cannot remove the Owner/.test(html) &&
    /The Owner can remove a Manager/.test(html) &&
    /Cancelling a subscription does not delete this company or its inspections/.test(html),
  'Personnel copy must say manager cannot delete owner, owner can delete manager, cancel keeps data'
);

assert.ok(
  /\.fire-s-subscribe-status/.test(css) && /\.fire-s-subscribe-cancel/.test(css),
  'Status and cancel panels must be styled'
);

assert.ok(
  /function paintSubscribeStatus\(/.test(subscribe) &&
    /function cancelSubscription\(/.test(subscribe) &&
    /Only the Owner can cancel this subscription/.test(subscribe) &&
    /Company name and inspections stay in the cloud/.test(subscribe),
  'Owner cancel flow must live on the Subscription page'
);

assert.ok(
  /Never delete companies, inspections, or people/.test(catalogSrc) &&
    /Cancelling or a failed payment does not delete/.test(catalogSrc) &&
    /renews automatically until you cancel/.test(catalogSrc),
  'Billing catalog must keep company data and say auto-renew until cancel'
);

const cancelFn = catalogSrc.match(/function cancelBilling\(\)[\s\S]*?function reactivateBilling/);
assert.ok(cancelFn, 'cancelBilling must exist');
assert.ok(
  !/\.delete\(/.test(cancelFn[0]) &&
    !/from\('inspections'\)/.test(cancelFn[0]) &&
    !/from\('companies'\)/.test(cancelFn[0]),
  'Cancel must not delete companies or inspections'
);

assert.ok(
  /This login is now active and renews until you cancel/.test(payfast) &&
    /PayFast payment was cancelled\. This company and its inspections stay saved/.test(payfast) &&
    /cat\.markUnpaid/.test(payfast),
  'Failed or cancelled PayFast must keep company data and mark unpaid, not wipe'
);

assert.ok(
  /function canRemovePerson\(/.test(team) &&
    /function canRemoveThisMember\(/.test(team) &&
    /lockOwner/.test(team) &&
    /A manager cannot remove the Owner/.test(team) &&
    /Only the Owner can remove a Manager/.test(team),
  'Personnel must hide Remove on the Owner and let the Owner remove a Manager'
);

assert.ok(
  /Home → Subscription → Cancel subscription/.test(terms) ||
    /taps Cancel subscription/.test(terms),
  'Terms must describe in-app cancel, not only Support'
);
assert.ok(
  /does not delete the company name/.test(terms),
  'Terms must say cancel or failed payment keeps company and inspections'
);

assert.ok(
  /renews automatically until you cancel/.test(manual) &&
    /taps <strong>Cancel subscription<\/strong>/.test(manual) &&
    /does not delete the company name or inspections/.test(manual),
  'User manual must show active-until-date, auto-renew, and how the owner cancels'
);

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
vm.runInNewContext(catalogSrc, sandbox);
const cat = sandbox.fireSSubscriptionCatalog;
assert.ok(cat && cat.markPaid && cat.cancelBilling && cat.statusHeadline);

cat.rememberInterval('monthly');
cat.markPaid('monthly');
assert.strictEqual(cat.billingStatus(), 'active');
const activeCopy = cat.statusHeadline();
assert.ok(/active for one month until/.test(activeCopy), activeCopy);
assert.ok(/renews automatically until you cancel/.test(activeCopy), activeCopy);
assert.ok(/does not delete the company name or inspections/.test(cat.statusKeepDataNote()));

cat.cancelBilling();
assert.strictEqual(cat.billingStatus(), 'cancelled');
const cancelledCopy = cat.statusHeadline();
assert.ok(/Cancelled/.test(cancelledCopy) && /will not auto-renew/.test(cancelledCopy), cancelledCopy);
assert.strictEqual(store['fireS.billingStatus'], 'cancelled');
assert.ok(store['fireS.billingRenewsOn'], 'cancel must keep the expiry date');

cat.markUnpaid();
assert.strictEqual(cat.billingStatus(), 'cancelled', 'unpaid return must not wipe a cancelled subscription');

cat.reactivateBilling('annual');
assert.strictEqual(cat.billingStatus(), 'active');
assert.ok(/active for one year until/.test(cat.statusHeadline()));

cat.markUnpaid();
assert.strictEqual(cat.billingStatus(), 'unpaid');
assert.ok(/Payment is not through yet/.test(cat.statusHeadline()));
assert.ok(/stay saved/.test(cat.statusHeadline()));

console.log('subscription-status-cancel.test.js: ok');
