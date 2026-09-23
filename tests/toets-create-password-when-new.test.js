'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const started = read('staging/fire-s-get-started.js');
const liveHtml = read('index.html');
const liveStarted = read('fire-s-get-started.js');

const toetsLogin = html.match(
  /id="fireSGetStartedLoginFields"[\s\S]*?id="fireSGetStartedResetFields"/
);
assert.ok(toetsLogin, 'Toets Access login block must exist');
const fields = toetsLogin[0];
const login = fields.indexOf('id="fireSDoLoginBtn"');
const forgot = fields.indexOf('id="fireSForgotPasswordBtn"');
const forgotNote = fields.indexOf('Forgot password: check Inbox');
const sub = fields.indexOf('id="fireSLoginSubscribeBtn"');
assert.ok(
  login >= 0 && forgot > login && forgotNote > forgot && sub > forgotNote,
  'Toets Access must put Subscribing New Company under Forgot password'
);
assert.ok(
  fields.indexOf('id="fireSSwitchToCreateBtn"') === -1 &&
    fields.indexOf('First time? Create password') === -1,
  'Toets Access must not show First time? Create password'
);
assert.ok(
  /setCreatePasswordVisible\(false\)/.test(started) &&
    !/setCreatePasswordVisible\(true\)/.test(started) &&
    !/loginEmail\.addEventListener\('input', scheduleCreatePasswordCheck\)/.test(
      started
    ),
  'Toets Access must never reveal Create password after a click or typed email'
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
  /\bhidden\b/.test(
    liveHtml.match(/id="fireSSwitchToCreateBtn"[^>]*>/)[0]
  ),
  'Live Create password must start hidden until an unknown email is typed'
);
assert.ok(
  /function refreshCreatePasswordButton\(/.test(liveStarted) &&
    /function setCreatePasswordVisible\(/.test(liveStarted) &&
    /fire_s_email_has_login/.test(liveStarted),
  'Live Access must show Create password only after an email with no registered password'
);

console.log('toets-create-password-when-new.test.js: ok');
