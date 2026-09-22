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
const entitlement = read('staging/fire-s-entitlement.js');
const env = read('staging/fire-s-env.js');
const css = read('staging/fire-s-subscribe.css');
const liveHtml = read('index.html');
const liveEnv = read('fire-s-env.js');

assert.ok(/1\.3\.108-toets/.test(env), 'Toets-blad version must be 1.3.108-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.65'/.test(liveEnv),
  'Live Fire-S must stay 1.3.65'
);
assert.ok(/Version 1\.3\.65/.test(liveHtml), 'Live HTML stays 1.3.65');
assert.ok(!/fireSStartSubscribeCheckout/.test(read('fire-s-subscribe.js')), 'live Subscribe wait for sit dit live');

const page = html.match(/id="fireSSubscribeSection"[\s\S]*?id="managementDashboardSection"/);
assert.ok(page, 'Subscription page must exist');
assert.ok(
  /id="fireSSubscribePayActions"/.test(page[0]) &&
    /id="fireSBillingSubscribeBtn"/.test(page[0]) &&
    /id="fireSPayfastPayBtn"/.test(page[0]) &&
    /Subscribe \/ Reactivate/.test(page[0]) &&
    /Pay R250 on PayFast/.test(page[0]),
  'Cancelled Subscribe must keep Subscribe/Reactivate and Pay on PayFast together'
);
assert.ok(
  page[0].indexOf('id="fireSSubscribePayActions"') < page[0].indexOf('id="fireSCompanyBillingPanel"'),
  'Pay actions must sit above Company billing so the two bars are on screen'
);
assert.ok(
  /id="fireSSubscribeAgainPanel"/.test(page[0]) && /id="fireSSubscribeCancelPanel"/.test(page[0]),
  'Cancel and Subscribe again markup may stay, but JS must hide them when cancelled'
);

assert.ok(/\.fire-s-subscribe-pay-actions/.test(css), 'Pay action stack must be styled');

assert.ok(
  /payBtn\.style\.display = showPay \? '' : 'none'/.test(subscribe) &&
    /var showPay = on && mode !== 'seat'/.test(subscribe),
  'Pay on PayFast must stay visible after cancel — do not wait for Subscribe again'
);
assert.ok(
  !/mode !== 'seat' && !cancelled/.test(subscribe),
  'Pay on PayFast must not hide itself just because billingStatus is cancelled'
);
assert.ok(/againPanel\) againPanel\.hidden = true/.test(subscribe), 'Subscribe again panel stays hidden');
assert.ok(
  /function billingSubscribe\(/.test(subscribe) &&
    /payNow\(\)/.test(subscribe) &&
    /function subscribeAgain\(/.test(subscribe) &&
    /payNow\(\);/.test(subscribe),
  'Subscribe/Reactivate and Subscribe again must start PayFast checkout'
);
assert.ok(/fireSStartSubscribeCheckout = payNow/.test(subscribe), 'Lock Subscribe/Reactivate can start checkout');
assert.ok(
  /currentUserProfile && window\.currentUserProfile\.role/.test(subscribe),
  'Owner Pay must still work if Home role paint is skipped while locked'
);

assert.ok(/function subscribeSectionShown\(/.test(entitlement));
assert.ok(/function hideLockedHomeChrome\(/.test(entitlement));
assert.ok(/if \(subscribeSectionShown\(\) && !preferHome\) \{/.test(entitlement));
assert.ok(/hideLockedHomeChrome\(\)/.test(entitlement));
assert.ok(/function subscribeControlAction\(/.test(entitlement));
assert.ok(/runSubscribeControl\('home'\)/.test(entitlement));
assert.ok(/pinLockedHome\(\{ preferHome: true \}\)/.test(entitlement));
assert.ok(/pinLockedHome\(\{ preferHome: true \}\)/.test(subscribe));
assert.ok(/doc\.write\(html\)/.test(read('staging/fire-s-payfast.js')), 'PayFast must write the hosted checkout page');
assert.ok(/window\.alert\(msg\)/.test(subscribe), 'PayFast errors must show, not stay silent');
assert.ok(/!canManage\(\) && !email/.test(subscribe), 'signed-in owner can open PayFast even if Home role paint lags');
assert.ok(/html\.fire-s-entitlement-blocked #fireSSubscribeBackBtn/.test(read('staging/fire-s-entitlement.css')));
assert.ok(/#fireSPayfastPayBtn/.test(entitlement), 'Pay bar must be an allowed locked target');
assert.ok(/fireSStartSubscribeCheckout/.test(entitlement), 'already-open Subscribe/Reactivate starts checkout');
assert.ok(/id="fireSSubscribeCompanyLine"/.test(html), 'Subscription must say which company this login pays for');
assert.ok(/function linkedCompanyId\(/.test(subscribe));
assert.ok(/function noCompanyPayMessage\(/.test(subscribe));
assert.ok(
  !/if \(!linkedCompanyId\(\)\) \{\s*paintCompanyLine\(\);\s*setMessage\(noCompanyPayMessage\(\), true\);\s*return;/.test(
    subscribe
  ),
  'PayFast checkout must still start; the server knows the company from the login'
);
assert.ok(/Subscribing New Company/.test(subscribe), 'no-company copy must send a new business to Access');
assert.ok(/same owner email/.test(subscribe), 'cancelled copy must keep the same owner email');
assert.ok(/html\.fire-s-access-open #fireSHomeLockPanel/.test(read('staging/fire-s-entitlement.css')));
assert.ok(/accessGateOpen\(\) && !companyId\(\)/.test(entitlement), 'Access Subscribe/Reactivate must not pay without a company');
assert.ok(/classList\.add\('fire-s-access-open'\)/.test(read('staging/fire-s-get-started.js')));
assert.ok(/#fireSSubscribeBackBtn/.test(entitlement), 'Back Home on Subscription must be an allowed locked target');
assert.ok(
  !/closest\('#fireSSubscribeBackBtn'\)\) return false/.test(entitlement),
  'locked Subscription Back Home must return to Home, not stay stuck'
);
assert.ok(/role === 'new_company' && ownerEmail\(\)/.test(subscribe), 'cancelled owner can pay while companyId is still loading');
assert.ok(/function preparePayCompany\(/.test(subscribe), 'PayFast must attach the linked company before checkout');
assert.ok(/function existingCompanyPayError\(/.test(subscribe), 'existing cancelled company must not be told to create a company');
assert.ok(/already exists/.test(subscribe));
assert.ok(/staffMustSignOut/.test(entitlement), 'cancelled staff must stay signed out');

function fakeEl(id, nodes) {
  if (!nodes[id]) {
    nodes[id] = {
      id: id,
      hidden: true,
      style: { display: 'none' },
      textContent: '',
      className: '',
      innerHTML: '',
      addEventListener: function () {},
      querySelector: function () {
        return fakeEl(id + '__child', nodes);
      },
      insertBefore: function () {},
      after: function () {},
      firstChild: null,
      setAttribute: function () {},
      removeAttribute: function () {},
      hasAttribute: function (name) {
        return name === 'hidden' ? !!nodes[id].hidden : false;
      },
      getAttribute: function () {
        return '';
      },
      parentNode: {
        after: function () {},
        insertBefore: function () {}
      },
      closest: function (sel) {
        if (sel === '#' + id) return nodes[id];
        return null;
      },
      classList: { add: function () {}, toggle: function () {}, contains: function () { return false; } }
    };
  }
  return nodes[id];
}

function loadEntitlement() {
  const store = {};
  const nodes = {};
  const sandbox = {
    window: { currentUserProfile: { id: 'u1', email: 'a@b.c', companyId: 'co1', role: 'company_owner' } },
    location: { hash: '', search: '', href: 'https://example.test/staging/' },
    document: {
      readyState: 'complete',
      addEventListener: function () {},
      getElementById: function (id) {
        return fakeEl(id, nodes);
      },
      querySelector: function () {
        return null;
      },
      body: {
        classList: { add: function () {}, toggle: function () {}, contains: function () { return false; } },
        appendChild: function () {}
      },
      documentElement: { classList: { add: function () {}, toggle: function () {}, contains: function () { return false; } } },
      createElement: function () {
        return { id: '', className: '', hidden: true, innerHTML: '', addEventListener: function () {}, style: {} };
      }
    },
    console: console,
    localStorage: {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem: function (key, value) {
        store[key] = String(value);
      }
    },
    alert: function () {},
    setTimeout: function () {
      return 0;
    }
  };
  sandbox.window = sandbox;
  sandbox.currentUserProfile = {
    id: 'u1',
    email: 'a@b.c',
    companyId: 'co1',
    role: 'company_owner'
  };
  vm.runInNewContext(entitlement, sandbox);
  sandbox.__nodes = nodes;
  return sandbox;
}

const client = loadEntitlement();
const subscribeSection = client.document.getElementById('fireSSubscribeSection');
subscribeSection.hidden = false;
subscribeSection.style.display = 'block';
client.fireSEntitlement.pinLockedHome();
assert.strictEqual(
  client.__nodes.homeSection.hidden,
  true,
  'Home lock panel must not sit above an open Subscription page'
);
assert.strictEqual(
  client.__nodes.fireSHomeLockPanel.hidden,
  true,
  'Subscribe/Reactivate lock bar stays off while Subscription is already open'
);

client.fireSEntitlement.pinLockedHome({ preferHome: true });
assert.strictEqual(
  client.__nodes.fireSSubscribeSection.hidden,
  true,
  'Back Home must close Subscription even while the account is locked'
);
assert.strictEqual(
  client.__nodes.homeSection.hidden,
  false,
  'Back Home must return to locked Home'
);

let checkoutCalls = 0;
client.fireSStartSubscribeCheckout = function () {
  checkoutCalls += 1;
};
client.fireSOpenSubscribe = function () {};
client.__nodes.fireSSubscribeSection.hidden = false;
client.__nodes.fireSSubscribeSection.style.display = 'block';
client.fireSEntitlement.openPlans();
assert.strictEqual(checkoutCalls, 1, 'Subscribe/Reactivate on an open Subscription page must start PayFast');

console.log('subscribe-bars-cancelled.test.js: ok');
