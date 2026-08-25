'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveHtml = read('index.html');
const liveEnv = read('fire-s-env.js');
const toetsHtml = read('staging/index.html');
const toetsEnv = read('staging/fire-s-env.js');
const sync = read('scripts/sync-toets-blad.sh');

assert.ok(
  !/url=\.\.\/\?env=staging/.test(toetsHtml),
  'Toets-blad must be its own app, not a bounce to live files'
);
assert.ok(
  /id="fireSBootScreen"/.test(toetsHtml) &&
    /id="fireSLoginSubscribeBtn"/.test(toetsHtml),
  'Toets-blad must include splash and Login with Subscribe as an option'
);
assert.ok(
  /appVersion:/.test(toetsEnv) && /isStaging: staging/.test(toetsEnv),
  'Toets-blad must load its own environment fence, not live files'
);
assert.ok(
  toetsHtml !== liveHtml || /1-3-13-login/.test(toetsHtml),
  'Toets-blad files must be able to move ahead of live'
);
assert.ok(
  /bounceLegacyToetsQuery/.test(liveEnv),
  'Old toets links with env=staging must open the toets folder, not live files'
);

console.log('toets-blad-own-copy.test.js: ok');
