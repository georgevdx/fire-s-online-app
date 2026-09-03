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
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.55'/.test(liveEnv),
  'Live Fire-S must stay 1.3.55'
);
assert.ok(/1\.3\.61-toets/.test(stagingEnv), 'Toets-blad version must be 1.3.61-toets');

const stagingLogin = stagingHtml.match(
  /id="fireSGetStartedLoginFields"[\s\S]*?id="fireSGetStartedResetFields"/
);
assert.ok(stagingLogin, 'Toets Access login block must exist');
assert.ok(
  /id="fireSLoginPassword"[\s\S]*id="fireSShowLoginPasswordBtn"/.test(stagingLogin[0]) &&
    /Show password/.test(stagingLogin[0]) &&
    /class="[^"]*fire-s-password-row/.test(stagingLogin[0]),
  'Toets email login must offer Show password next to the password field'
);
assert.ok(
  /fireSShowLoginPasswordBtn/.test(stagingStarted) &&
    /Hide password/.test(stagingStarted) &&
    /setAttribute\('type', showing \? 'password' : 'text'\)/.test(stagingStarted),
  'Toets Access JS must toggle the login password between hidden and visible'
);
assert.ok(
  /\.fire-s-password-row \{/.test(stagingCss) &&
    /\.fire-s-show-password-btn \{/.test(stagingCss),
  'Toets Access CSS must keep Show password beside the field, not as a full-width Access button'
);
assert.ok(
  /fire-s-get-started\.css\?v=2-15-show-pw/.test(stagingHtml) &&
    /fire-s-get-started\.js\?v=2-45-desktop/.test(stagingHtml) &&
    /fire-s-env\.js\?v=1-3-61-toets/.test(stagingHtml),
  'Toets-blad must cache-bust the show-password Access files'
);

assert.ok(
  !/fireSShowLoginPasswordBtn/.test(liveHtml) &&
    !/fire-s-password-row/.test(liveHtml) &&
    !/Show password/.test(
      liveHtml.match(/id="fireSGetStartedLoginFields"[\s\S]*?id="fireSDoLoginBtn"/)[0]
    ),
  'Live email login must not show a password-visibility option'
);
assert.ok(
  !/fireSShowLoginPasswordBtn/.test(liveStarted) &&
    !/Hide password/.test(liveStarted) &&
    !/\.fire-s-password-row \{/.test(liveCss),
  'Live Access scripts and styles must not include the toets show-password control'
);
assert.ok(
  /fire-s-get-started\.css\?v=2-14-hide-saved/.test(liveHtml) &&
    /fire-s-get-started\.js\?v=2-45-desktop/.test(liveHtml) &&
    /fire-s-env\.js\?v=1-3-55-live/.test(liveHtml),
  'Live cache tags must stay on the previous Access files'
);

console.log('toets-show-login-password.test.js: ok');
