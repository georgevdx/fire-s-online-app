'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const listing = read('play/store-listing.txt');
const twa = JSON.parse(read('play/twa-manifest.json'));
const manifest = JSON.parse(read('manifest.json'));
const assetlinks = JSON.parse(read('.well-known/assetlinks.json'));
const privacy = read('privacy.html');
const toetsPrivacy = read('staging/privacy.html');

assert.ok(fs.existsSync(path.join(__dirname, '..', '.nojekyll')), 'GitHub Pages must publish dotfiles for Digital Asset Links');

const short = listing.split('\n').find((line, index, lines) => lines[index - 1] === 'Short description (80 characters max)');
assert.ok(short && short.length > 0 && short.length <= 80, 'Play short description must be 1 to 80 characters');
assert.strictEqual(listing.includes('Fire-S\n') || /App name \(30 characters max\)\nFire-S\n/.test(listing), true);
assert.ok(!/R349|R3 490|Company S/.test(listing), 'Play listing must use the current Fire-S price and name');
assert.ok(/R250/.test(listing) && /R2 500/.test(listing) && /PayFast/.test(listing), 'Play listing must match the live subscription');

assert.strictEqual(twa.packageId, 'za.co.companys.fires');
assert.strictEqual(twa.host, 'georgevdx.github.io');
assert.strictEqual(twa.appVersion, '1.3.67');
assert.strictEqual(twa.appVersionCode, 1367);
assert.strictEqual(twa.startUrl, '/fire-s-online-app/');
assert.strictEqual(assetlinks[0].target.package_name, twa.packageId);

assert.strictEqual(manifest.display, 'standalone');
assert.strictEqual(manifest.short_name, 'Fire-S');
assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && /maskable/.test(icon.purpose)));

assert.ok(/id="delete-account"/.test(privacy) && /id="delete-account"/.test(toetsPrivacy), 'Privacy policy must give Play an account-deletion section');
assert.ok(/Version 1\.3\.67/.test(read('index.html')), 'Displayed live version stays 1.3.67');

console.log('play-store-ready.test.js: ok');
