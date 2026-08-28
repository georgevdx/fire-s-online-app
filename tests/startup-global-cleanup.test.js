'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const env = read('staging/fire-s-env.js');
const liveEnv = read('fire-s-env.js');
const html = read('staging/index.html');
const startup = read('staging/fire-s-startup-stability.js');
const getStarted = read('staging/fire-s-get-started.js');
const app = read('staging/app.js');
const css = read('staging/fire-s-get-started.css');

assert.ok(/1\.3\.37-toets/.test(env), 'Toets-blad version must be 1.3.37-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.31'/.test(liveEnv) &&
    /bounceLegacyToetsQuery/.test(liveEnv) &&
    /function paintVersion\(/.test(liveEnv),
  'Live Fire-S must be 1.3.31, bounce old toets links, and paint the version'
);

assert.ok(
  /function paintVersion\(/.test(env) && /#appVersion, \.brand-version/.test(env),
  'Version must paint as soon as the environment fence loads'
);
assert.ok(
  /fireSMarkAuthSettled/.test(app) && /__fireSAuthSettled/.test(startup),
  'Splash must wait until the cloud session check has settled'
);
assert.ok(
  /reason !== 'timeout' && reason !== 'auth-settled'/.test(startup),
  'Splash may only skip the session wait on timeout'
);
assert.ok(
  /if \(!supabaseClient \|\| !supabaseClient\.auth\)/.test(app),
  'Session restore must not crash when the cloud client is missing'
);
assert.ok(
  /initHomeCommandCentre\(\);\n  initFindingsCentre/.test(app),
  'Home command centre must not bind twice on startup'
);

assert.ok(
  /id="fireSLoginInstallBtn"/.test(html),
  'Login after splash must still offer Install on this phone'
);
assert.ok(
  /id="fireSGetStartedStatus"[\s\S]*fire-s-legal-links[\s\S]*Open Terms and conditions[\s\S]*Open Privacy policy/.test(html),
  'Terms and Privacy must stay visible on Login, not only on the old Access choice list'
);
assert.ok(
  /preferredMode === 'choices'/.test(getStarted) &&
    /else if \(preferredMode === 'choices'\) mode = 'login'/.test(getStarted) &&
    /function showChoices\(\) \{\s*showLogin\(\);/.test(getStarted),
  'Cloud Open Access must open the same Access page as Login, not a second choice list'
);
assert.ok(
  !/Fire-S © Company S/.test(html) && /Fire-S\. Do not copy or resell this app/.test(html),
  'Access must name Fire-S, not Company S'
);
assert.ok(
  /fire-s-role-guest #homeSection \.home-hero/.test(css) &&
    /fire-s-role-guest #mainCommandCentre/.test(css),
  'Logged-out Home must not show INSPECT tiles under Access'
);

assert.ok(/window\.fireSRevealApp = revealApp/.test(startup), 'startup must expose fireSRevealApp');

console.log('startup-global-cleanup.test.js: ok');
