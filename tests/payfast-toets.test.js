'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const envSrc = read('staging/fire-s-env.js');
const payfastSrc = read('staging/fire-s-payfast.js');
const catalogSrc = read('staging/fire-s-subscriptions.js');
const html = read('staging/index.html');
const subscribe = read('staging/fire-s-subscribe.js');
const getStarted = read('staging/fire-s-get-started.js');
const liveHtml = read('index.html');
const liveEnv = read('fire-s-env.js');

assert.ok(/1\.3\.114-toets/.test(envSrc), 'Toets-blad version must be 1.3.114-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.67'/.test(liveEnv),
  'Live Fire-S must be 1.3.67 after sit dit live'
);
assert.ok(/fire-s-payfast\.js/.test(liveHtml), 'Live root must load PayFast after sit dit live');
assert.ok(/fire-s-payfast\.js/.test(html), 'Toets-blad must load the PayFast module');
assert.ok(/id="fireSPayfastPayBtn"/.test(html), 'Subscription page must have Pay on PayFast');
assert.ok(/PayFast sandbox/.test(html), 'Toets Subscribe copy must say sandbox — no real money');
assert.ok(/startCheckout/.test(getStarted) && /startCheckout/.test(subscribe), 'Subscribe flows must open PayFast');
assert.ok(/function paintSubscribePayButtons/.test(getStarted), 'Subscribe form must show Pay on PayFast');
const guest = html.match(/id="fireSGetStartedGuestFields"[\s\S]*?id="fireSGetStartedCompanyOnly"/);
assert.ok(
  guest &&
    /id="fireSGetStartedCreateBtn"/.test(guest[0]) &&
    /Pay R250 on PayFast/.test(guest[0]) &&
    !/id="fireSRegisterViewPlansBtn"/.test(guest[0]),
  'Toets Subscribe form must pay on PayFast and not duplicate View Plans'
);
assert.ok(!/VAT/.test(payfastSrc), 'PayFast module must not mention VAT to subscribers');

assert.ok(!/merchantKey/.test(envSrc), 'Toets env must not ship a merchant key');
assert.ok(!/passphrase\s*:/.test(envSrc), 'Toets env must not ship a PayFast passphrase');
assert.ok(!/merchant_key/.test(payfastSrc), 'PWA PayFast module must not post merchant_key itself');
assert.ok(/function submitHostedCheckout\(/.test(payfastSrc), 'PayFast must open hosted checkout HTML');
assert.ok(/submitHostedCheckout\(raw\)/.test(payfastSrc), 'HTML checkout responses must open PayFast');
assert.ok(/function sandboxSignedHtml\(/.test(payfastSrc), 'merchant-email checkout must fall back to SQL-signed test buyer');
assert.ok(/fire_s_sandbox_payfast_html/.test(payfastSrc));
assert.ok(/doc\.write\(html\)/.test(payfastSrc), 'Hosted PayFast HTML must replace this page so the auto-submit runs');
assert.ok(/HTMLFormElement\.prototype\.submit/.test(payfastSrc), 'PayFast form fallback must call the real submit');
assert.ok(!/generateSignature/.test(payfastSrc), 'Browser must not sign PayFast requests');
const fetchBody = payfastSrc.match(/body:\s*JSON\.stringify\(\{[\s\S]*?\}\)/);
assert.ok(fetchBody, 'Checkout POST body must exist');
assert.ok(!/amount/.test(fetchBody[0]), 'Browser must not send a price');
assert.ok(!/companyId/.test(fetchBody[0]), 'Browser must not send company_id as authority');
assert.ok(!/mPaymentId/.test(fetchBody[0]), 'Browser must not send the payment reference');

const store = {};
const sandbox = {
  window: {},
  console,
  fetch: async function () {
    throw new Error('fetch should not run in unit enablement checks');
  },
  location: {
    protocol: 'https:',
    host: 'georgevdx.github.io',
    hostname: 'georgevdx.github.io',
    pathname: '/fire-s-online-app/staging/',
    search: '',
    href: 'https://georgevdx.github.io/fire-s-online-app/staging/',
    hash: ''
  },
  document: {
    addEventListener: function () {},
    getElementById: function () {
      return null;
    },
    querySelectorAll: function () {
      return [];
    }
  },
  localStorage: {
    getItem: key => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    }
  },
  history: { replaceState: function () {} }
};
sandbox.window = sandbox;

vm.runInNewContext(envSrc, sandbox);
vm.runInNewContext(catalogSrc, sandbox);
vm.runInNewContext(payfastSrc, sandbox);

const env = sandbox.FIRE_S_ENV;
const pf = sandbox.fireSPayfast;
assert.ok(env && env.isStaging, 'PayFast tests must run as staging');
assert.ok(pf && pf.isEnabled(), 'Toets-blad PayFast sandbox must be on');
assert.strictEqual(env.payfast.mode, 'sandbox');
assert.ok(!env.payfast.merchantKey && !env.payfast.passphrase);
assert.strictEqual(pf.processUrl(), 'https://sandbox.payfast.co.za/eng/process');
assert.strictEqual(pf.amountFor('monthly'), '250.00');
assert.strictEqual(pf.amountFor('annual'), '2500.00');
assert.strictEqual(pf.payLabel('monthly'), 'Pay R250 on PayFast');
assert.strictEqual(pf.payLabel('annual'), 'Pay R2 500 on PayFast');
assert.ok(
  /\/functions\/v1\/payfast-checkout$/.test(pf.checkoutUrl()),
  'Checkout URL must be the staging Edge Function'
);

(function testHostedWrite() {
  let written = '';
  sandbox.document.open = function () {};
  sandbox.document.write = function (html) {
    written = String(html || '');
  };
  sandbox.document.close = function () {};
  const htmlDoc =
    '<!DOCTYPE html><html><body><form id="payfast" method="POST" action="https://sandbox.payfast.co.za/eng/process"></form><script>document.getElementById("payfast").submit();</script></body></html>';
  const result = pf.submitHostedCheckout(htmlDoc);
  assert.ok(result && result.ok, 'Hosted PayFast HTML must open');
  assert.ok(written.indexOf('sandbox.payfast.co.za/eng/process') !== -1, 'PayFast auto-submit HTML must be written into this page');

  sandbox.currentUserProfile = { email: 'johandb@live.com' };
  sandbox.window.currentUserProfile = sandbox.currentUserProfile;
  const merchantHtml =
    '<form action="https://sandbox.payfast.co.za/eng/process"><input type="hidden" name="email_address" value="johandb@live.com"></form>';
  const blocked = pf.submitHostedCheckout(merchantHtml);
  assert.ok(blocked && blocked.ok === false && blocked.reason === 'same-account');
  assert.ok(/SUPABASE_payfast_sandbox_buyer\.sql/.test(written), written);
  assert.ok(!/form id="payfast"/.test(written));

  const buyerHtml =
    '<form id="payfast" method="POST" action="https://sandbox.payfast.co.za/eng/process"><input type="hidden" name="email_address" value="fires-toets-buyer@example.com"></form><script>document.getElementById("payfast").submit();</script>';
  const buyer = pf.submitHostedCheckout(buyerHtml);
  assert.ok(buyer && buyer.ok, 'test buyer email must still open PayFast');
  assert.ok(written.indexOf('fires-toets-buyer@example.com') !== -1);
})();

(function testHideOkBannerWhenCancelled() {
  const banner = { id: 'fireSPayfastReturnBanner', parentNode: { removed: false } };
  banner.parentNode.removeChild = function (node) {
    banner.parentNode.removed = node === banner;
  };
  sandbox.document.getElementById = function (id) {
    return id === 'fireSPayfastReturnBanner' ? banner : null;
  };
  sandbox.document.body = { firstChild: banner, insertBefore: function () {} };
  sandbox.fireSSubscriptionCatalog = {
    billingStatus: function () {
      return 'cancelled';
    }
  };
  sandbox.window.fireSSubscriptionCatalog = sandbox.fireSSubscriptionCatalog;
  assert.ok(typeof pf.hideReturnBanner === 'function');
  pf.hideReturnBanner();
  assert.ok(banner.parentNode.removed, 'cancelled subscription must drop the green PayFast received bar');
  sandbox.location.search = '';
  sandbox.location.href = 'https://georgevdx.github.io/fire-s-online-app/staging/';
  pf.paintReturnBanner();
  assert.ok(banner.parentNode.removed, 'paint must not put the received bar back while cancelled');
})();

console.log('payfast-toets.test.js: ok');
