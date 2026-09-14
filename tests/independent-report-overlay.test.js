'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('staging/app.js');
const html = read('staging/index.html');
const phoneBack = read('staging/fire-s-phone-back.js');
const liveApp = read('app.js');

assert.ok(
  /function installFireSIndependentReportOverlay\(/.test(app) &&
    /fireSShowIndependentReportOverlay/.test(app) &&
    /Back to Quick Actions/.test(app) &&
    /Back to Home/.test(app),
  'Non-PDF reports must open in an independent overlay with back to Quick Actions or Home'
);
assert.ok(
  /formSection\.style\.display = 'none'/.test(
    app.slice(
      app.indexOf('function revealInspectionReportSection()'),
      app.indexOf('function latestInspectionHistoryIndex(project)')
    )
  ),
  'The report overlay must not open underneath the inspection form'
);
assert.ok(
  /function openLatestPremisesPdf\(/.test(app) &&
    /Latest PDF/.test(app) &&
    /premisesHasLatestReport/.test(app),
  'Quick Actions must offer Latest PDF when the report data exists'
);
assert.ok(
  /fireSIndependentReportOverlayOpen/.test(phoneBack) &&
    /fire-s-phone-back\.js\?v=1-3-report-overlay/.test(html),
  'Phone Back must close the report overlay first'
);
assert.ok(
  /bypassOpenGate: true/.test(
    liveApp.slice(
      liveApp.indexOf('function openLatestPremisesReport('),
      liveApp.indexOf('function generateArchivedInspectionReport(')
    )
  ),
  'Live Latest Report stays on the inspection form until sit live'
);
assert.ok(
  /app\.js\?v=1-3-78-toets-complrep/.test(html),
  'Toets must cache-bust the independent report overlay'
);

console.log('independent-report-overlay.test.js: ok');
