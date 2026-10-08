'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const app = fs.readFileSync(path.join(__dirname, '..', 'staging/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'staging/styles.css'), 'utf8');

const paginationStart = app.indexOf('function applyMeasuredA4Pagination');
assert.ok(paginationStart >= 0, 'measured pagination must exist on the toetsblad');
const pagination = app.slice(paginationStart, paginationStart + 4500);

assert.ok(
  pagination.includes("'.report-conclusion-signoff'"),
  'the conclusion and sign-off must move together'
);
assert.ok(
  pagination.includes('Math.floor(exportWidthPx * printableHeightMm / printableWidthMm)'),
  'page height must match the html2pdf canvas slice'
);

const exportStart = app.indexOf('async function exportReport');
const exportSrc = app.slice(exportStart, exportStart + 12000);
assert.ok(
  /pagebreak:\s*\{\s*mode:\s*\[\s*\]/.test(exportSrc),
  'html2pdf must not add a second page break after the measured spacers'
);

assert.ok(
  app.includes('by\\u2011law'),
  'the findings note must keep by-law on one line'
);

const spacerRule = css.slice(css.indexOf('.pdf-export-mode .pdf-measured-page-spacer'));
assert.ok(
  /page-break-inside:\s*auto !important/.test(spacerRule.slice(0, 700)),
  'measured spacers must stay empty space'
);

console.log('report-page-layout.test.js: ok');
