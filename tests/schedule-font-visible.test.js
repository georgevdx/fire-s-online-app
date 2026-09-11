'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertScheduleFonts(label, css) {
  assert.ok(
    /body\.fire-s-schedule-view \.schedule-new-panel[\s\S]*color: #0f172a !important/.test(css),
    label + ': Schedule booking paper must use dark type in Dark Mode'
  );
  assert.ok(
    /body\.fire-s-schedule-view \.schedule-mode-btn\.is-active[\s\S]*color: #ffffff !important/.test(css) &&
      /body\.fire-s-schedule-view \.schedule-mode-btn\.is-active[\s\S]*background: #1e3a8a !important/.test(css),
    label + ': the selected New site / Existing site chip must stay white-on-navy'
  );
  assert.ok(
    /body\.fire-s-schedule-view \.schedule-mode-btn:not\(\.is-active\)[\s\S]*color: #0f172a !important/.test(css),
    label + ': the unselected Schedule chip must stay dark-on-light'
  );
}

assertScheduleFonts('Live styles', read('styles.css'));
assertScheduleFonts('Live fit-text', read('fire-s-fit-text.css'));
assertScheduleFonts('Toets styles', read('staging/styles.css'));
assertScheduleFonts('Toets fit-text', read('staging/fire-s-fit-text.css'));
assertScheduleFonts('Toets dark-type', read('staging/fire-s-dark-type.css'));

assert.ok(
  /styles\.css\?v=1-3-65-coisolate/.test(read('index.html')) &&
    /fire-s-fit-text\.css\?v=1-14-coisolate/.test(read('index.html')),
  'Live must cache-bust Schedule font CSS'
);
assert.ok(
  /styles\.css\?v=1-3-78-toets-coisolate/.test(read('staging/index.html')) &&
    /fire-s-dark-type\.css\?v=1-3-coisolate/.test(read('staging/index.html')),
  'Toets must cache-bust Schedule font CSS'
);

console.log('schedule-font-visible.test.js: ok');
