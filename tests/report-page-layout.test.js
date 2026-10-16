'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertPdfPages(label, app, css) {
  const paginationStart = app.indexOf('function applyMeasuredA4Pagination');
  assert.ok(paginationStart >= 0, label + ' must measure PDF pages');
  const pagination = app.slice(paginationStart, paginationStart + 4500);
  assert.ok(
    pagination.includes("'.report-conclusion-signoff'"),
    label + ' must keep the conclusion and sign-off together'
  );
  assert.ok(
    pagination.includes('Math.floor(exportWidthPx * printableHeightMm / printableWidthMm)'),
    label + ' page height must match the PDF slice'
  );
  const exportStart = app.indexOf('async function exportReport');
  const exportSrc = app.slice(exportStart, exportStart + 12000);
  assert.ok(
    /pagebreak:\s*\{\s*mode:\s*\[\s*\]/.test(exportSrc),
    label + ' must not add a second PDF page break'
  );
  assert.ok(app.includes('by\\u2011law'), label + ' must keep by-law on one line');
  const spacerRule = css.slice(css.indexOf('.pdf-export-mode .pdf-measured-page-spacer'));
  assert.ok(
    /page-break-inside:\s*auto !important/.test(spacerRule.slice(0, 700)),
    label + ' spacers must stay empty space'
  );
}

assertPdfPages('Live', read('app.js'), read('styles.css'));
assertPdfPages('Toets', read('staging/app.js'), read('staging/styles.css'));
assert.ok(
  /app\.js\?v=1-3-67-pdf/.test(read('index.html')) &&
    /styles\.css\?v=1-3-67-pdf/.test(read('index.html')) &&
    /Version 1\.3\.67/.test(read('index.html')),
  'Live PDF files must cache-bust without changing version 1.3.67'
);
assert.ok(
  /app\.js\?v=1-3-123-pdf/.test(read('staging/index.html')) &&
    /styles\.css\?v=1-3-123-pdf/.test(read('staging/index.html')) &&
    /Version 1\.3\.119-toets/.test(read('staging/index.html')),
  'Toets must use the same PDF page rules'
);

console.log('report-page-layout.test.js: ok');
