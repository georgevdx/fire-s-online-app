'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertSplash(html, startup, started, label) {
  assert.ok(
    /src="fire-s-logo\.png"/.test(html) &&
      /id="fireSBootScreen"/.test(html) &&
      /id="fireSBootStatus"/.test(html) &&
      /rel="preload" href="fire-s-logo\.png"/.test(html) &&
      /z-index: 200000/.test(html),
    label + ': splash must show the Fire-S logo'
  );
  assert.ok(
    /#fireSBootScreen\.is-on/.test(html) &&
      /id="fireSBootScreen" class="is-on"/.test(html) &&
      !/html:not\(\.fire-s-booting\) #fireSBootScreen \{ display: none !important; \}/.test(html),
    label + ': splash must be able to show again after first boot (Login tap)'
  );
  assert.ok(
    /window\.fireSShowSplash = showSplash/.test(startup) &&
      /window\.fireSHideSplash = hideSplash/.test(startup) &&
      /function sessionStillRestoring\(/.test(startup) &&
      /!window\.__fireSAuthSettled/.test(startup) &&
      /window\.__fireSSessionPending/.test(startup) &&
      /BOOT_SESSION_MAX_MS/.test(startup) &&
      /SPLASH_HOLD_MS/.test(startup) &&
      /reason !== 'home' &&/.test(startup) &&
      /scheduleReveal\('home', 180\)/.test(startup),
    label + ': splash must stay up while a previous login session restores Home'
  );
  assert.ok(
    /paintBootSplashNow\('Signing in…'\)/.test(started) &&
      /window\.fireSShowSplash\('Signing in…'\)/.test(started) &&
      /beginLoginInFlight\(\);/.test(started) &&
      /if \(!loginReachedHome\) hideLoginSplash\(\)/.test(started) &&
      /await paintSplashFrame\(\)/.test(started) &&
      /function enterAppHome\(msg\) \{[\s\S]*fireSRevealApp\('home'\)/.test(started),
    label + ': Login tap must show the splash until Home opens'
  );
}

assertSplash(
  read('index.html'),
  read('fire-s-startup-stability.js'),
  read('fire-s-get-started.js'),
  'Live'
);
assertSplash(
  read('staging/index.html'),
  read('staging/fire-s-startup-stability.js'),
  read('staging/fire-s-get-started.js'),
  'Toets'
);

console.log('splash-until-home.test.js ok');
