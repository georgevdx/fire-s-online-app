'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('app.js');
const css = read('styles.css');

assert.ok(
  !/tap to filter/.test(app),
  'Executive Snapshot must not say tap to filter'
);
assert.ok(
  /open overdue/.test(app) && /photo evidence/.test(app),
  'Overdue and Photos must be summary labels, not filter hints'
);
assert.ok(
  /Summary of visible premises/.test(app),
  'Snapshot heading must not tell the user to tap tiles'
);
assert.ok(
  /Do not inject a banner above the premises list/.test(app),
  'Post-site sync reminder must not appear above the premises list'
);
assert.ok(
  /function updatePostSiteSyncReminder\(\) \{\s*const reminder = document\.getElementById\('postSiteSyncReminder'\);\s*if \(!reminder\) return;\s*[\s\S]*reminder\.innerHTML = '';/.test(app),
  'Post-site sync reminder must stay empty'
);
assert.ok(
  /cursor: default/.test(css) &&
    /fire-s-exec-grid \.fire-s-exec-stat:hover[\s\S]*transform: none/.test(css),
  'Snapshot tiles must not look tappable'
);

console.log('snapshot-no-tap-sync-hop.test.js: ok');
