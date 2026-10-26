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
const stagingApp = read('staging/app.js');
const stagingOpen = read('staging/open.html');
const stagingManifest = read('staging/manifest.json');

assert.ok(
  /function fireSDropStuckLiveCache\(/.test(liveHtml) &&
    /fireS\.liveCacheDrop\.1-3-67-premises/.test(liveHtml) &&
    /Cache-Control" content="no-cache, no-store, must-revalidate/.test(liveHtml) &&
    /service-worker\.js\?v=108-82-photos/.test(liveHtml) &&
    /fire-s-108-82-photos/.test(liveSw),
  'Live must drop the stuck service worker so a phone can tell it has 1.3.67'
);
assert.ok(
  /\/staging\(\\\/\|\$\)\/i\.test\(url\.pathname/.test(liveSw) ||
    /\\\/staging\(\\\/\|\$\)\/i\.test\(url\.pathname/.test(liveSw),
  'Live service worker must not hijack toets-blad pages'
);
assert.ok(
  /cache: 'no-store'/.test(liveSw) &&
    /fresh \? \{ cache: 'no-store' \}/.test(liveSw) &&
    liveSw.indexOf('/\\.js$/i.test(path)') !== -1 &&
    !/'\.\/index\.html'/.test(liveSw.split('self.addEventListener')[0]),
  'Live must fetch HTML and scripts from the network, not from a precached index.html'
);
assert.ok(
  /function fireSDropStuckToetsCache\(/.test(stagingHtml) &&
    /fireS\.toetsCacheDrop\.1-3-130/.test(stagingHtml) &&
    /service-worker\.js\?v=108-84-toets-130/.test(stagingHtml) &&
    !/staging skips the live service worker/.test(stagingHtml) &&
    /Fire-S toets service worker registered/.test(stagingHtml),
  'Toets-blad must register its own service worker so live cannot keep an old 1.3.107 page'
);
assert.ok(
  /cache: 'no-store'/.test(stagingSw) &&
    stagingSw.indexOf('/\\.css$/i.test(path)') !== -1 &&
    /location\.href\)\.indexOf\(scope\)/.test(stagingHtml),
  'Toets must drop any worker that still controls the toets page and fetch CSS from the network'
);
assert.ok(
  /Version 1\.3\.67/.test(liveHtml) &&
    /Version 1\.3\.130-toets/.test(stagingHtml),
  'Displayed versions stay 1.3.67 live and 1.3.130-toets so a phone can tell it has this build'
);
assert.ok(
  /updateViaCache: 'none'/.test(stagingHtml) &&
    !/client\.navigate\(/.test(stagingSw) &&
    /function fireSLeaveStuckToetsPage\(/.test(stagingApp) &&
    /toets=130/.test(stagingOpen) &&
    /location\.href\)\.indexOf\(scope\)/.test(stagingOpen) &&
    /"start_url": "\.\/index\.html\?toets=130"/.test(stagingManifest) &&
    /searchParams\.set\('toets', '130'\)/.test(stagingHtml) &&
    /searchParams\.set\('toets', '130'\)/.test(stagingApp) &&
    !/searchParams\.set\('toets', '129'\)/.test(stagingHtml + stagingApp),
  'A stuck phone must open staging/open.html and land on index.html?toets=130'
);

console.log('version-goes-through.test.js: ok');
