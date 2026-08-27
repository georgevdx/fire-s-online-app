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

assert.ok(/1\.3\.35-toets/.test(env), 'Toets-blad version must be 1.3.35-toets');
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
    /New company\? Subscribe/.test(gate[0]),
  'The one Access page must include Login fields plus Create password and Subscribe'
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

console.log('one-access-page.test.js: ok');
