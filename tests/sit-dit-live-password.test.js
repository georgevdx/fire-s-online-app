'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const env = read('fire-s-env.js');
const html = read('index.html');
const started = read('fire-s-get-started.js');
const css = read('fire-s-get-started.css');
const app = read('app.js');
const manual = read('fire-s-user-manual.js');
const roles = read('fire-s-clean-home-roles.js');

assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.49'/.test(env),
  'Live Fire-S must be 1.3.49 after sit dit live'
);
assert.ok(!/fire-s-payfast\.js/.test(html), 'Live root must not load PayFast');
assert.ok(
  /R250 \/ month \(or R2 500 \/ year\)/.test(html) && /No card is taken yet/.test(html),
  'Live Subscribe must stay on invoices at R250 / R2 500'
);

const gate = html.match(/id="fireSGetStarted"[\s\S]*?id="mainCommandCentre"/);
assert.ok(gate, 'Live Access gate must exist');
assert.ok(
  /id="fireSGetStartedLoginFields"/.test(gate[0]) &&
    /id="fireSLoginEmail"/.test(gate[0]) &&
    /id="fireSDoLoginBtn"/.test(gate[0]) &&
    /First time\? Create password/.test(gate[0]) &&
    /Subscribing New Company/.test(gate[0]) &&
    /check Inbox and Junk/.test(gate[0]) &&
    /id="fireSGetStartedResetFields"/.test(gate[0]) &&
    /id="fireSDoResetBtn"/.test(gate[0]) &&
    /Save new password/.test(gate[0]),
  'Live Access must be one page with Login, Forgot password, Junk note, and Choose a new password'
);
assert.ok(
  /fire-s-access-subscribe-btn/.test(gate[0]) &&
    /#fireSLoginSubscribeBtn\.fire-s-access-subscribe-btn/.test(css) &&
    /background: #2563eb !important/.test(css),
  'Subscribing New Company must be the blue Access button'
);
assert.ok(
  !/← Back to Access/.test(
    html.match(/id="fireSGetStartedLoginFields"[\s\S]*?id="fireSGetStartedResetFields"/)[0]
  ),
  'Live Login must not sit behind a second Back-to-Access step'
);
assert.ok(
  /display: none !important/.test(
    css.match(/\.fire-s-get-started-choices \{[\s\S]*?\}/)[0]
  ),
  'Live CSS must hide the old two-step Access list'
);

assert.ok(
  /function showChoices\(\) \{\s*showLogin\(\);/.test(started) &&
    /else if \(preferredMode === 'choices'\) mode = 'login'/.test(started) &&
    /function showResetPassword\(/.test(started) &&
    /updateUser\(\{ password:/.test(started) &&
    /isPasswordRecovery\(\)/.test(started) &&
    /Check Inbox AND Junk/.test(started) &&
    /over_email_send_rate_limit/.test(started),
  'Live JS must treat Access as one page and save a new password after the reset link'
);

assert.ok(
  /PASSWORD_RECOVERY/.test(app) &&
    /fire-s:password-recovery/.test(app) &&
    /type=recovery/.test(app) &&
    /fireSOpenAccess\('login'\)/.test(app) &&
    !/fireSOpenAccess\('choices'\)/.test(app),
  'Live must open Choose a new password from the reset link and keep Logout on the one Access page'
);

assert.ok(
  /one <strong>Access<\/strong> page/.test(manual) &&
    /no separate Login page/.test(manual) &&
    /Choose a new password/.test(manual) &&
    /Check Inbox and Junk/.test(manual),
  'Live user manual must cover one Access page and password change'
);
assert.ok(
  /setHero\('Fire-S', 'ACCESS'/.test(roles),
  'Live guest Home must say Access, not a separate Login screen'
);
assert.ok(
  /isPasswordRecoveryNow/.test(roles) &&
    /fire-s-password-recovery #fireSGetStarted/.test(css),
  'Live must keep Choose a new password open instead of the company Home'
);

console.log('sit-dit-live-password.test.js: ok');
