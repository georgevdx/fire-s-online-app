'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveHtml = read('index.html');
const liveSw = read('service-worker.js');
const stagingHtml = read('staging/index.html');
const stagingSw = read('staging/service-worker.js');

assert.ok(
  /function fireSDropStuckLiveCache\(/.test(liveHtml) &&
    /fireS\.liveCacheDrop\.1-3-67/.test(liveHtml) &&
    /Cache-Control" content="no-cache, no-store, must-revalidate/.test(liveHtml) &&
    /service-worker\.js\?v=108-75-live-67/.test(liveHtml) &&
    /fire-s-108-75-live-67/.test(liveSw),
  'Live must drop the stuck service worker so a phone can tell it has 1.3.67'
);
assert.ok(
  /\/staging\(\\\/\|\$\)\/i\.test\(url\.pathname/.test(liveSw) ||
    /\\\/staging\(\\\/\|\$\)\/i\.test\(url\.pathname/.test(liveSw),
  'Live service worker must not hijack toets-blad pages'
);
assert.ok(
  /cache: 'no-store'/.test(liveSw) &&
    /isDoc \? \{ cache: 'no-store' \}/.test(liveSw) &&
    !/'\.\/index\.html'/.test(liveSw.split('self.addEventListener')[0]),
  'Live must fetch HTML from the network, not from a precached index.html'
);
assert.ok(
  /function fireSDropStuckToetsCache\(/.test(stagingHtml) &&
    /fireS\.toetsCacheDrop\.1-3-113/.test(stagingHtml) &&
    /service-worker\.js\?v=108-75-toets-113/.test(stagingHtml) &&
    !/staging skips the live service worker/.test(stagingHtml) &&
    /Fire-S toets service worker registered/.test(stagingHtml),
  'Toets-blad must register its own service worker so live cannot keep an old 1.3.107 page'
);
assert.ok(
  /cache: 'no-store'/.test(stagingSw) &&
    /location\.href\)\.indexOf\(scope\)/.test(stagingHtml),
  'Toets must drop any worker that still controls the toets page, including a live hijack'
);
assert.ok(
  /Version 1\.3\.67/.test(liveHtml) &&
    /Version 1\.3\.112-toets/.test(stagingHtml),
  'Displayed versions stay 1.3.67 live and 1.3.112-toets so a phone can tell it has this build'
);

console.log('version-goes-through.test.js: ok');
