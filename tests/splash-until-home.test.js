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
      /id="fireSBootStatus"/.test(html),
    label + ': splash must show the Fire-S logo'
  );
  assert.ok(
    /#fireSBootScreen\.is-on/.test(html) &&
      !/html:not\(\.fire-s-booting\) #fireSBootScreen \{ display: none !important; \}/.test(html),
    label + ': splash must be able to show again after first boot (Login tap)'
  );
  assert.ok(
    /window\.fireSShowSplash = showSplash/.test(startup) &&
      /window\.fireSHideSplash = hideSplash/.test(startup) &&
      /function sessionStillRestoring\(/.test(startup) &&
      /__fireSSessionPending && !window\.__fireSAuthSettled/.test(startup) &&
      /BOOT_SESSION_MAX_MS/.test(startup),
    label + ': splash must stay up while a previous login session restores Home'
  );
  assert.ok(
    /window\.fireSShowSplash\('Signing in…'\)/.test(started) &&
      /beginLoginInFlight\(\);/.test(started) &&
      /fireSHideSplash/.test(started) &&
      /function enterAppHome\(msg\) \{[\s\S]*fireSHideSplash/.test(started),
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
