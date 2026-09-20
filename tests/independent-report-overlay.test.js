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
  /function installFireSIndependentReportOverlay\(/.test(liveApp) &&
    /fireSShowIndependentReportOverlay/.test(liveApp) &&
    /function openLatestPremisesPdf\(/.test(liveApp) &&
    /Latest PDF/.test(liveApp),
  'Live Latest Report must open the independent overlay and offer Latest PDF'
);
assert.ok(
  !/bypassOpenGate: true/.test(
    liveApp.slice(
      liveApp.indexOf('function openLatestPremisesReport('),
      liveApp.indexOf('async function openLatestPremisesPdf(')
    )
  ),
  'Live Latest Report must not reopen the inspection form'
);
assert.ok(
  /#reportSection > h2/.test(app) &&
    /display:none !important/.test(
      app.slice(
        app.indexOf('function installFireSIndependentReportOverlay('),
        app.indexOf('function generateArchivedInspectionReport(')
      )
    ) &&
    /font-weight:900/.test(
      app.slice(
        app.indexOf('function installFireSIndependentReportOverlay('),
        app.indexOf('function generateArchivedInspectionReport(')
      )
    ),
  'The overlay top heading must be heavy white; the pale in-card Inspection Report h2 must stay hidden'
);
assert.ok(
  /#reportSection > h2/.test(liveApp) &&
    /display:none !important/.test(
      liveApp.slice(
        liveApp.indexOf('function installFireSIndependentReportOverlay('),
        liveApp.indexOf('function generateArchivedInspectionReport(')
      )
    ) &&
    /font-weight:900/.test(
      liveApp.slice(
        liveApp.indexOf('function installFireSIndependentReportOverlay('),
        liveApp.indexOf('function generateArchivedInspectionReport(')
      )
    ),
  'Live overlay top heading must be heavy white; the pale in-card Inspection Report h2 must stay hidden'
);
assert.ok(
  !/onclick="exportReport\(\)"/.test(
    app.slice(
      app.indexOf('function generateArchivedInspectionReport('),
      app.indexOf('function closeArchivedInspectionDetail(')
    )
  ) &&
    !/onclick="exportReport\(\)"/.test(
      liveApp.slice(
        liveApp.indexOf('function generateArchivedInspectionReport('),
        liveApp.indexOf('function closeArchivedInspectionDetail(')
      )
    ),
  'The report body must not keep a second Export PDF button; the overlay bar already has one'
);
assert.ok(
  /app\.js\?v=1-3-102-pay/.test(html),
  'Toets must cache-bust the independent report overlay'
);

console.log('independent-report-overlay.test.js: ok');
