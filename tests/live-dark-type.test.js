'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const live = read('fire-s-dark-type.css');
const toets = read('staging/fire-s-dark-type.css');
const liveHtml = read('index.html');

assert.strictEqual(
  live,
  toets,
  'Live last-loaded Dark Mode type must match the toets-blad file'
);

assert.ok(
  /Last-loaded Dark Mode type/.test(live) &&
    /#nextInspectionCard \.scheduling-card-header h3/.test(live) &&
    /#checklistCard \.checklist-expand-hint/.test(live) &&
    /body\.fire-s-schedule-view \.schedule-new-panel/.test(live) &&
    /\.command-centre-card strong/.test(live) &&
    /\.quick-link-chip \.quick-link-main/.test(live) &&
    /\.checklist-section-label-name/.test(live) &&
    /\.fire-s-photo-category-strip-v1116 span/.test(live) &&
    /#fireSIndependentReportOverlay #fireSReportOverlayTitle/.test(live),
  'Live dark-type must keep Q&A, Scheduling Centre, Schedule and open-inspection paper rules'
);

const lastStylesheet = liveHtml.match(/<link rel="stylesheet"[^>]+>/g).pop();
assert.ok(
  /fire-s-dark-type\.css\?v=1-3-rephead/.test(lastStylesheet),
  'Live must load fire-s-dark-type.css last, same as toets'
);

assert.ok(
  /Version 1\.3\.67/.test(liveHtml),
  'Displayed live version stays 1.3.67'
);

assert.ok(
  /fire-s-payfast\.js/.test(liveHtml) &&
    !/sample-company-s-logo\.svg/.test(liveHtml),
  'Live must load PayFast and must not pull toets sample-logo extras'
);

console.log('live-dark-type.test.js: ok');
