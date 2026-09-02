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
const subscribe = read('staging/fire-s-subscribe.js');
const roles = read('staging/fire-s-clean-home-roles.js');
const manual = read('staging/fire-s-user-manual.js');
const css = read('staging/fire-s-subscribe.css');
const liveHtml = read('index.html');

assert.ok(/1\.3\.56-toets/.test(env), 'Toets-blad version must be 1.3.56-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.50'/.test(liveEnv),
  'Live Fire-S must be 1.3.50 after sit dit live'
);

const choice = html.match(/id="fireSChoiceCompany"[\s\S]*?<\/button>/);
assert.ok(choice, 'Access must still offer Subscribe for a new owner');
assert.ok(
  !/R250|R2 500|R349|R3 490/.test(choice[0]),
  'Access choice list must not show the fee before the Subscribe form'
);

const login = html.match(
  /id="fireSGetStartedLoginFields"[\s\S]*?id="fireSGetStartedCreateFields"/
);
assert.ok(login && !/R250|R2 500|R349|R3 490/.test(login[0]), 'Login must not show subscription fees');

const create = html.match(
  /id="fireSGetStartedCreateFields"[\s\S]*?id="fireSGetStartedGuestFields"/
);
assert.ok(
  create && !/R250|R2 500|R349|R3 490/.test(create[0]),
  'Create password must not show subscription fees'
);

const guest = html.match(
  /id="fireSGetStartedGuestFields"[\s\S]*?id="fireSGetStartedCompanyOnly"/
);
assert.ok(
  guest && /R250/.test(guest[0]) && /R2 500/.test(guest[0]),
  'Owner Subscribe form must still show the fees'
);

const subscribePage = html.match(
  /id="fireSSubscribeSection"[\s\S]*?id="managementDashboardSection"/
);
assert.ok(
  subscribePage &&
    /per month per login is/.test(subscribePage[0]) &&
    /R250/.test(subscribePage[0]) &&
    /R2 500/.test(subscribePage[0]),
  'Owner Subscription page must still show the fees'
);

const people = html.match(/id="companyTeamAddPanel"[\s\S]*?id="companyTeamJoinMap"/);
assert.ok(
  people &&
    /Each new email is a new subscription/.test(people[0]) &&
    !/R250|R2 500|R349|R3 490/.test(people[0]),
  'People list must not show the fee; fees stay on the Subscribe page'
);

assert.ok(
  /View or change monthly or annual billing/.test(roles) &&
    /View or change monthly or annual billing/.test(subscribe),
  'Owner Home Subscription card must not print the fee'
);
assert.ok(
  !/copy\.textContent = 'R349/.test(subscribe) &&
    !/Monthly is R349 per subscription/.test(subscribe),
  'Home reminder and Home card must not print R349'
);

assert.ok(
  /function showFees\(/.test(manual) &&
    /function isInspectorManual\(/.test(manual) &&
    /You never see the subscription fees/.test(manual) &&
    /you do not see the fees/.test(manual),
  'Inspector user manual must hide fees and keep owner Subscribe copy for owners'
);

assert.ok(
  /body\.fire-s-role-inspector #cmdSubscribeBtn/.test(css) &&
    /body\.fire-s-role-inspector #fireSSubscribeSection/.test(css) &&
    /body\.fire-s-role-inspector #fireSExpiryReminder/.test(css),
  'Inspector Home must hide Subscription, fees and the billing reminder'
);

assert.ok(
  /hide\('cmdSubscribeBtn'\)/.test(roles) &&
    /Download the inspection guide as a PDF/.test(roles),
  'Inspector Home must keep the user manual and hide the Subscription card'
);

const catalogSrc = read('staging/fire-s-subscriptions.js');
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
assert.strictEqual(
  sandbox.fireSSubscriptionCatalog.priceLabel('monthly'),
  'R250 per month per login'
);

assert.ok(
  /staff never Subscribe/.test(liveHtml) &&
    !/you pay R250 per subscription · staff never Subscribe/.test(liveHtml) &&
    /R250 per month/.test(liveHtml),
  'Live Access choice must hide fees; Subscribe form must still show them'
);

console.log('hide-inspector-fees.test.js: ok');
