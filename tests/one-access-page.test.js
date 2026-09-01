'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const env = read('staging/fire-s-env.js');
const html = read('staging/index.html');
const getStarted = read('staging/fire-s-get-started.js');
const css = read('staging/fire-s-get-started.css');
const app = read('staging/app.js');
const manual = read('staging/fire-s-user-manual.js');
const liveHtml = read('index.html');
const liveStarted = read('fire-s-get-started.js');
const liveCss = read('fire-s-get-started.css');
const liveApp = read('app.js');
const liveManual = read('fire-s-user-manual.js');

assert.ok(/1\.3\.54-toets/.test(env), 'Toets-blad version must be 1.3.54-toets');
assert.ok(
  /function showChoices\(\) \{\s*showLogin\(\);/.test(liveStarted) &&
    /else if \(preferredMode === 'choices'\) mode = 'login'/.test(liveStarted),
  'Live Access and Login must be one page after sit dit live'
);

const gate = html.match(/id="fireSGetStarted"[\s\S]*?id="mainCommandCentre"/);
assert.ok(gate, 'Access gate must exist');
assert.ok(
  /id="fireSGetStartedLoginFields"/.test(gate[0]) &&
    /id="fireSLoginEmail"/.test(gate[0]) &&
    /id="fireSDoLoginBtn"/.test(gate[0]) &&
    /First time\? Create password/.test(gate[0]) &&
    /Subscribing New Company/.test(gate[0]),
  'The one Access page must include Login fields plus Create password and Subscribe'
);
assert.ok(
  /fire-s-access-subscribe-btn/.test(gate[0]) &&
    /background: #2563eb !important/.test(css),
  'Subscribing New Company must be the blue Access button'
);
assert.ok(
  /hidden/.test(html.match(/id="fireSGetStartedChoices"[\s\S]*?<\/div>/)[0]) ||
    /display: none !important/.test(css),
  'The old Access choice list must not be a separate first page'
);
assert.ok(
  !/← Back to Access/.test(
    html.match(/id="fireSGetStartedLoginFields"[\s\S]*?id="fireSGetStartedCreateFields"/)[0]
  ),
  'Login must not sit behind a second Back-to-Access step'
);
assert.ok(
  /Type your email and password, then Login/.test(gate[0]),
  'Access help must describe Login on this same page'
);

assert.ok(
  /function showChoices\(\) \{\s*showLogin\(\);/.test(getStarted) &&
    /else if \(preferredMode === 'choices'\) mode = 'login'/.test(getStarted) &&
    /setTitle\(\s*'Access'/.test(getStarted),
  'JS must treat Access and Login as one page titled Access'
);
assert.ok(
  /fireSOpenAccess\('login'\)/.test(app) &&
    !/fireSOpenAccess\('choices'\)/.test(app),
  'Logout and Home Access must open the same Login form, not the old choice list'
);
assert.ok(
  /\.fire-s-get-started-choices \{\s*display: none !important;/.test(css),
  'CSS must hide the old two-step Access list'
);

assert.ok(
  /one <strong>Access<\/strong> page/.test(manual) &&
    /no separate Login page/.test(manual) &&
    /First time\? Create password/.test(manual),
  'User manual must describe one Access page'
);

assert.ok(
  /id="fireSGetStartedLoginFields"/.test(liveHtml) &&
    /First time\? Create password/.test(liveHtml) &&
    /display: none !important/.test(
      liveCss.match(/\.fire-s-get-started-choices \{[\s\S]*?\}/)[0]
    ) &&
    /fireSOpenAccess\('login'\)/.test(liveApp) &&
    !/fireSOpenAccess\('choices'\)/.test(liveApp) &&
    /one <strong>Access<\/strong> page/.test(liveManual),
  'Live root must use the same one Access page after sit dit live'
);

function loginOrder(src, label) {
  const block = src.match(
    /id="fireSGetStartedLoginFields"[\s\S]*?id="fireSGetStartedResetFields"/
  );
  assert.ok(block, label + ' must have the Access login fields');
  const fields = block[0];
  const login = fields.indexOf('id="fireSDoLoginBtn"');
  const create = fields.indexOf('First time? Create password');
  const sub = fields.indexOf('id="fireSLoginSubscribeBtn"');
  const forgotNote = fields.indexOf('Forgot password: check Inbox');
  assert.ok(
    login >= 0 && create > login && sub > create && forgotNote > sub,
    label + ' must put Subscribing New Company after Login and before the Forgot note'
  );
}
loginOrder(html, 'Toets Access');
loginOrder(liveHtml, 'Live Access');

assert.ok(
  /subscribeBtn\.style\.display = ''/.test(getStarted) &&
    /subscribeBtn\.style\.display = ''/.test(liveStarted) &&
    !/allow \? '' : 'none'/.test(getStarted) &&
    !/allow \? '' : 'none'/.test(liveStarted),
  'Access must keep Subscribing New Company visible on the login form'
);
assert.ok(
  /min-height: 52px/.test(css) && /min-height: 52px/.test(liveCss),
  'Phone Subscribe button must be tall enough to see and tap'
);
assert.ok(
  /#fireSGetStartedLoginFields > \.fire-s-get-started-note:first-of-type \{[\s\S]*?display: none;/.test(css) &&
    /#fireSGetStartedLoginFields > \.fire-s-get-started-note:first-of-type \{[\s\S]*?display: none;/.test(liveCss),
  'Phone Access must hide the long first note so Subscribe fits without scrolling'
);
assert.ok(
  /clearJoiningAsStaff\(\)/.test(
    getStarted.match(/function showRegister\(\) \{[\s\S]*?function showCompanyOnly/)[0]
  ) &&
    /clearJoiningAsStaff\(\)/.test(
      liveStarted.match(/function showRegister\(\) \{[\s\S]*?function showCompanyOnly/)[0]
    ) &&
    !/Your company is already registered\. Use Login/.test(getStarted) &&
    !/Your company is already registered\. Use Login/.test(liveStarted),
  'Subscribe tap must open the form instead of bouncing back to Login'
);
assert.ok(
  /fireSGetStartedGuestFields/.test(
    liveStarted.match(/function showRegister\(\) \{[\s\S]*?function showCompanyOnly/)[0]
  ),
  'Live Subscribe tap must show the Subscribe fields'
);

function extraServices(src, label) {
  const block = src.match(
    /id="fireSGetStartedLoginFields"[\s\S]*?id="fireSGetStartedResetFields"/
  );
  assert.ok(block, label + ' must keep Access login fields');
  assert.ok(
    /id="fireSAccessExtraServicesBtn"/.test(block[0]) &&
      /Additional services/.test(block[0]) &&
      /data-access-service="Fire Safety Consultancy"/.test(block[0]) &&
      /data-access-service="Rational Fire Design Support"/.test(block[0]) &&
      /data-access-service="Fire Plan Assistance \(Assist with approval from Local Government\)/.test(
        block[0]
      ) &&
      /id="fireSAccessServiceSendBtn"/.test(block[0]) &&
      !/View saved requests/.test(block[0]) &&
      !/id="fireSAccessServiceViewBtn"/.test(block[0]),
    label + ' must use an Additional services button with three request buttons'
  );
  assert.ok(
    !/<summary>/.test(block[0]) && !/<details/.test(block[0]),
    label + ' must not keep the old static extra-services list'
  );
}
extraServices(html, 'Toets Access');
extraServices(liveHtml, 'Live Access');
assert.ok(
  /#fireSAccessExtraServicesBtn\.fire-s-access-extra-services-btn/.test(css) &&
    /#fireSAccessExtraServicesBtn\.fire-s-access-extra-services-btn/.test(liveCss) &&
    /\.fire-s-access-service-btn/.test(css) &&
    /\.fire-s-access-service-btn/.test(liveCss),
  'Access extra services must style the parent button and the three service buttons'
);
assert.ok(
  /function wireAccessExtraServices\(/.test(getStarted) &&
    /function wireAccessExtraServices\(/.test(liveStarted) &&
    /fireSNotifyServiceRequest/.test(getStarted) &&
    /fireSNotifyServiceRequest/.test(liveStarted),
  'Access extra services must open a request form from each sub-button'
);

console.log('one-access-page.test.js: ok');
