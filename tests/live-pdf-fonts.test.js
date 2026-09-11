'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertPdfInk(label, css) {
  assert.ok(
    /#reportContent \*[\s\S]*color: #0f172a !important/.test(css) &&
      /#reportContentPdfClone \*[\s\S]*color: #0f172a !important/.test(css) &&
      /\.pdf-export-mode \*[\s\S]*color: #0f172a !important/.test(css),
    label + ': PDF and on-screen report must use dark ink on white paper'
  );
  assert.ok(
    /\.pdf-export-mode \.report-section-heading[\s\S]*color: #ffffff !important/.test(css) &&
      /\.pdf-export-mode \.report-block h3[\s\S]*color: #b71c1c !important/.test(css),
    label + ': PDF section bars stay white-on-red and block titles stay brand red'
  );
}

assertPdfInk('Live styles', read('styles.css'));
assertPdfInk('Live fit-text', read('fire-s-fit-text.css'));
assertPdfInk('Toets styles', read('staging/styles.css'));
assertPdfInk('Toets dark-type', read('staging/fire-s-dark-type.css'));

assert.ok(
  /styles\.css\?v=1-3-65-pdffont/.test(read('index.html')) &&
    /fire-s-fit-text\.css\?v=1-14-pdffont/.test(read('index.html')),
  'Live must cache-bust PDF font CSS'
);

console.log('live-pdf-fonts.test.js: ok');
