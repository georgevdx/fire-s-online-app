'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const started = read('staging/fire-s-get-started.js');
const css = read('staging/fire-s-get-started.css');
const liveHtml = read('index.html');
const liveStarted = read('fire-s-get-started.js');

const toetsLogin = html.match(
  /id="fireSGetStartedLoginFields"[\s\S]*?id="fireSGetStartedResetFields"/
);
assert.ok(toetsLogin, 'Toets Access login block must exist');
const fields = toetsLogin[0];
const login = fields.indexOf('id="fireSDoLoginBtn"');
const create = fields.indexOf('id="fireSSwitchToCreateBtn"');
const forgot = fields.indexOf('id="fireSForgotPasswordBtn"');
const forgotNote = fields.indexOf('Forgot password: check Inbox');
const sub = fields.indexOf('id="fireSLoginSubscribeBtn"');
assert.ok(
  login >= 0 &&
    create > login &&
    forgot > create &&
    forgotNote > forgot &&
    sub > forgotNote,
  'Toets Access must put Subscribing New Company under Forgot password'
);
assert.ok(
  /id="fireSSwitchToCreateBtn"[^>]*\bhidden\b/.test(fields),
  'Toets Create password must start hidden on Access'
);
assert.ok(
  /#fireSSwitchToCreateBtn\[hidden\]/.test(css),
  'Toets CSS must keep a hidden Create password button off the Access screen'
);

assert.ok(
  /function setCreatePasswordVisible\(/.test(started) &&
    /function refreshCreatePasswordButton\(/.test(started) &&
    /fire_s_email_has_login/.test(started) &&
    /scheduleCreatePasswordCheck/.test(started) &&
    /rememberEmailHasPassword\(email, true\)/.test(started),
  'Toets Access must show Create password only after an email with no registered password'
);

const liveLogin = liveHtml.match(
  /id="fireSGetStartedLoginFields"[\s\S]*?id="fireSGetStartedResetFields"/
);
assert.ok(liveLogin, 'Live Access login block must exist');
assert.ok(
  liveLogin[0].indexOf('id="fireSLoginSubscribeBtn"') <
    liveLogin[0].indexOf('Forgot password: check Inbox'),
  'Live Access must keep Subscribing New Company above Forgot password'
);
assert.ok(
  !/\bhidden\b/.test(
    liveHtml.match(/id="fireSSwitchToCreateBtn"[^>]*>/)[0]
  ),
  'Live Create password must stay visible on Access until sit dit live'
);
assert.ok(
  !/function refreshCreatePasswordButton\(/.test(liveStarted),
  'Live Access must not hide Create password yet'
);

console.log('toets-create-password-when-new.test.js: ok');
