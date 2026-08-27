'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const env = read('staging/fire-s-env.js');
const html = read('staging/index.html');
const started = read('staging/fire-s-get-started.js');
const app = read('staging/app.js');
const manual = read('staging/fire-s-user-manual.js');
const liveStarted = read('fire-s-get-started.js');
const liveHtml = read('index.html');

assert.ok(/1\.3\.34-toets/.test(env), 'Toets-blad version must be 1.3.34-toets');

assert.ok(
  /id="fireSForgotPasswordBtn"/.test(html) &&
    /check Inbox and Junk/.test(html) &&
    /id="fireSGetStartedResetFields"/.test(html) &&
    /id="fireSDoResetBtn"/.test(html) &&
    /Save new password/.test(html),
  'Access must explain Junk and show Choose a new password after the email link'
);

assert.ok(
  /resetPasswordForEmail/.test(started) &&
    /Check Inbox AND Junk/.test(started) &&
    /Outlook and Live hide it/.test(started) &&
    /over_email_send_rate_limit/.test(started) &&
    /Wait one minute/.test(started),
  'Forgot password must tell the owner to check Junk and wait if they tap twice'
);

assert.ok(
  /PASSWORD_RECOVERY/.test(app) &&
    /fire-s:password-recovery/.test(app) &&
    /type=recovery/.test(app) &&
    /function showResetPassword\(/.test(started) &&
    /updateUser\(\{ password:/.test(started) &&
    /isPasswordRecovery\(\)/.test(started),
  'Opening the reset link must keep Access open on Choose a new password'
);

assert.ok(
  /Check Inbox and Junk/.test(manual) &&
    /Choose a new password/.test(manual),
  'User manual must cover Junk and the new-password screen'
);

assert.ok(
  /Check the inbox for /.test(liveStarted) &&
    !/id="fireSGetStartedResetFields"/.test(liveHtml),
  'Live root must keep the current Forgot password copy until sit dit live'
);

console.log('reset-password-email.test.js: ok');
