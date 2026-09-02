'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveEnv = read('fire-s-env.js');
const stagingEnv = read('staging/fire-s-env.js');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveCss = read('fire-s-subscribe.css');
const stagingCss = read('staging/fire-s-subscribe.css');
const liveSubscribe = read('fire-s-subscribe.js');
const stagingSubscribe = read('staging/fire-s-subscribe.js');
const liveCatalogSrc = read('fire-s-subscriptions.js');
const stagingCatalogSrc = read('staging/fire-s-subscriptions.js');
const liveTerms = read('terms.html');
const stagingTerms = read('staging/terms.html');
const liveManual = read('fire-s-user-manual.js');
const stagingManual = read('staging/fire-s-user-manual.js');

assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.50'/.test(liveEnv),
  'Live Fire-S must be 1.3.50 so cancelled companies can subscribe again'
);
assert.ok(/1\.3\.55-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.55-toets');

[liveHtml, stagingHtml].forEach(function (html, i) {
  const name = i === 0 ? 'live' : 'toets';
  const page = html.match(/id="fireSSubscribeSection"[\s\S]*?id="managementDashboardSection"/);
  assert.ok(page, name + ': Subscription page must exist');
  assert.ok(
    /id="fireSSubscribeAgainPanel"/.test(page[0]) &&
      /id="fireSSubscribeAgainBtn"/.test(page[0]) &&
      />Subscribe again</.test(page[0]) &&
      /This company name stays/.test(page[0]) &&
      /Do not type a new name on Access/.test(page[0]),
    name + ': cancelled Subscription must offer Subscribe again for the same company name'
  );
  assert.ok(
    /Already cancelled\? Do not type a new company name/.test(html) &&
      /Login with the same owner email/.test(html),
    name + ': Access Subscribe must tell cancelled owners to Login, not pick a new name'
  );
});

[liveCss, stagingCss].forEach(function (css, i) {
  const name = i === 0 ? 'live' : 'toets';
  assert.ok(/\.fire-s-subscribe-again/.test(css), name + ': Subscribe again panel must be styled');
});

[liveSubscribe, stagingSubscribe].forEach(function (src, i) {
  const name = i === 0 ? 'live' : 'toets';
  assert.ok(
    /function subscribeAgain\(/.test(src) &&
      /reactivateBilling/.test(src) &&
      /fireSSubscribeAgainBtn/.test(src) &&
      /same company name/.test(src) &&
      /Do not type a new name on Access/.test(src),
    name + ': Subscribe again must reactivate the same company, not create a new name'
  );
  assert.ok(
    /againPanel\.hidden = !\(canManage\(\) && cancelled\)/.test(src) ||
      /againPanel\) againPanel\.hidden = !\(canManage\(\) && cancelled\)/.test(src),
    name + ': Subscribe again panel must show only when the subscription is cancelled'
  );
});

[liveTerms, stagingTerms].forEach(function (src, i) {
  const name = i === 0 ? 'live' : 'toets';
  assert.ok(
    /taps Subscribe again/.test(src) &&
      /The company name stays/.test(src) &&
      /do not create a new company/.test(src),
    name + ': Terms must say cancelled companies subscribe again under the same name'
  );
});

[liveManual, stagingManual].forEach(function (src, i) {
  const name = i === 0 ? 'live' : 'toets';
  assert.ok(
    /To subscribe again/.test(src) &&
      /same owner email/.test(src) &&
      /Subscribe again/.test(src) &&
      /Do not tap/.test(src),
    name + ': User manual must tell owners to Login and Subscribe again, not pick a new name'
  );
});

function runCatalog(src) {
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

[liveCatalogSrc, stagingCatalogSrc].forEach(function (src, i) {
  const name = i === 0 ? 'live' : 'toets';
  const { cat, store } = runCatalog(src);
  cat.rememberInterval('monthly');
  cat.markPaid('monthly');
  cat.cancelBilling();
  assert.strictEqual(cat.billingStatus(), 'cancelled', name + ': cancel keeps the company cancelled, not deleted');
  assert.ok(store['fireS.billingRenewsOn'], name + ': cancel keeps the expiry date');
  const cancelledCopy = cat.statusHeadline();
  assert.ok(/Cancelled/.test(cancelledCopy), cancelledCopy);
  assert.ok(/Subscribe again with this same company name/.test(cancelledCopy), cancelledCopy);
  assert.ok(/do not choose a new name on Access/.test(cancelledCopy), cancelledCopy);
  assert.ok(/does not delete the company name or inspections/.test(cat.statusKeepDataNote()));

  cat.reactivateBilling('annual');
  assert.strictEqual(cat.billingStatus(), 'active', name + ': Subscribe again must make the same company active');
  assert.ok(/active for one year until/.test(cat.statusHeadline()), cat.statusHeadline());
  assert.strictEqual(store['fireS.billingStatus'], 'active');
});

console.log('subscribe-again-same-company.test.js: ok');
