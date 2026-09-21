'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertInspectFonts(label, css) {
  assert.ok(
    /\.command-centre-card strong[\s\S]*color: #0f172a !important/.test(css) &&
      /\.command-centre-card > span[\s\S]*color: #334155 !important/.test(css),
    label + ': command tiles must use dark title and slate detail on white paper'
  );
  assert.ok(
    /\.command-centre-card\.cc-warning \.command-centre-status[\s\S]*color: #ef6c00 !important/.test(css) &&
      /\.command-centre-card\.cc-complete \.command-centre-status[\s\S]*color: #1b5e20 !important/.test(css),
    label + ': command-tile status pills must keep their warning and complete colours'
  );
  assert.ok(
    /\.command-centre-actions-heading[\s\S]*color: #0b1220 !important/.test(css) &&
      /\.quick-link-section-title[\s\S]*-webkit-text-fill-color: #0b1220 !important/.test(css) &&
      /\.quick-link-chip \.quick-link-main[\s\S]*color: #0f172a !important/.test(css) &&
      /\.quick-link-chip strong[\s\S]*color: #b71c1c !important/.test(css),
    label + ': Smart Actions headings and rows must stay dark, with red counts'
  );
  assert.ok(
    /\.checklist-section-label-name[\s\S]*color: #0f172a !important/.test(css) &&
      /\.checklist-section-label-status[\s\S]*color: #334155 !important/.test(css) &&
      /\.section-action-required \.checklist-section-label-status[\s\S]*color: #ffffff !important/.test(css),
    label + ': Q&A section chips must be dark on light pills, white-on-red when action is required'
  );
  assert.ok(
    /\.fire-s-photo-category-strip-v1116 span[\s\S]*color: #0f172a !important/.test(css) &&
      /\.fire-s-photo-category-filter-v1116c button\.active[\s\S]*color: #ffffff !important/.test(css),
    label + ': Photo strip copy must be dark; the All chip stays white-on-red'
  );
}

assertInspectFonts('Live styles', read('styles.css'));
assertInspectFonts('Live fit-text', read('fire-s-fit-text.css'));
assertInspectFonts('Live dark-type', read('fire-s-dark-type.css'));
assertInspectFonts('Toets styles', read('staging/styles.css'));
assertInspectFonts('Toets fit-text', read('staging/fire-s-fit-text.css'));
assertInspectFonts('Toets dark-type', read('staging/fire-s-dark-type.css'));

assert.strictEqual(
  read('fire-s-dark-type.css'),
  read('staging/fire-s-dark-type.css'),
  'Live and toets last-loaded Dark Mode type must stay identical'
);

assert.ok(
  /styles\.css\?v=1-3-65-count/.test(read('index.html')) &&
    /fire-s-fit-text\.css\?v=1-19-sitlive/.test(read('index.html')) &&
    /fire-s-dark-type\.css\?v=1-3-rephead/.test(read('index.html')),
  'Live must cache-bust open-inspection font CSS'
);

assert.ok(
  /styles\.css\?v=1-3-107-toets-now/.test(read('staging/index.html')) &&
    /fire-s-fit-text\.css\?v=1-19-actovd/.test(read('staging/index.html')) &&
    /fire-s-dark-type\.css\?v=1-8-rephead/.test(read('staging/index.html')),
  'Toets must cache-bust open-inspection font CSS'
);

assert.ok(
  /Version 1\.3\.65/.test(read('index.html')) &&
    /Version 1\.3\.107-toets/.test(read('staging/index.html')),
  'Displayed versions stay 1.3.65 live and 1.3.107-toets'
);

console.log('live-inspect-fonts.test.js: ok');
