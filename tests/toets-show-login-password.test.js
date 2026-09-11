'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveStarted = read('fire-s-get-started.js');
const stagingStarted = read('staging/fire-s-get-started.js');
const liveCss = read('fire-s-get-started.css');
const stagingCss = read('staging/fire-s-get-started.css');
const liveEnv = read('fire-s-env.js');
const stagingEnv = read('staging/fire-s-env.js');

assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.65'/.test(liveEnv),
  'Live Fire-S must be 1.3.65'
);
assert.ok(/1\.3\.78-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.78-toets');

function assertShowPassword(html, started, css, label) {
  const login = html.match(
    /id="fireSGetStartedLoginFields"[\s\S]*?id="fireSGetStartedResetFields"/
  );
  assert.ok(login, label + ' Access login block must exist');
  assert.ok(
    /id="fireSLoginPassword"[\s\S]*id="fireSShowLoginPasswordBtn"/.test(login[0]) &&
      /Show password/.test(login[0]) &&
      /class="[^"]*fire-s-password-row/.test(login[0]),
    label + ' email login must offer Show password next to the password field'
  );
  assert.ok(
    /fireSShowLoginPasswordBtn/.test(started) &&
      /Hide password/.test(started) &&
      /setAttribute\('type', showing \? 'password' : 'text'\)/.test(started),
    label + ' Access JS must toggle the login password between hidden and visible'
  );
  assert.ok(
    /\.fire-s-password-row \{/.test(css) &&
      /max-width: 100%/.test(css.match(/\.fire-s-password-row \{[\s\S]*?\}/)[0]) &&
      /\.fire-s-show-password-btn \{/.test(css) &&
      /overflow-x: hidden/.test(css) &&
      /grid-template-columns: minmax\(0, 1fr\)/.test(css),
    label + ' phone Access must keep Show password inside the card'
  );
}

assertShowPassword(stagingHtml, stagingStarted, stagingCss, 'Toets');
assertShowPassword(liveHtml, liveStarted, liveCss, 'Live');

assert.ok(
  /fire-s-get-started\.css\?v=2-19-legal/.test(stagingHtml) &&
    /fire-s-get-started\.js\?v=2-51-show-pw/.test(stagingHtml) &&
    /fire-s-env\.js\?v=1-3-78-ver/.test(stagingHtml),
  'Toets-blad must cache-bust the phone Access files'
);
assert.ok(
  /fire-s-get-started\.css\?v=2-19-legal/.test(liveHtml) &&
    /fire-s-get-started\.js\?v=2-51-show-pw/.test(liveHtml) &&
    /fire-s-env\.js\?v=1-3-65-ver/.test(liveHtml),
  'Live must cache-bust Show password Access files'
);

console.log('toets-show-login-password.test.js: ok');
