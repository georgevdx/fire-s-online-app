'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const stagingApp = read('staging/app.js');
const stagingHtml = read('staging/index.html');
const stagingCss = read('staging/styles.css');

const liveApp = read('app.js');
const liveHtml = read('index.html');
const liveCss = read('styles.css');

function assertSharedFilterLayout(label, app, html, css) {
  assert.ok(
    /id="inspectionDateFilterPanel"/.test(html) &&
      /data-date-filter="today"/.test(html) &&
      /id="inspectionDateFrom"/.test(html) &&
      /id="inspectionDateTo"/.test(html),
    label + ' must keep the Inspection Date filter panel'
  );
  assert.ok(
    /function fireSHideMoreFiltersNonDateTiles\(/.test(app) &&
      /function fireSPaintGatewayStatusFilters\(/.test(app),
    label + ' must hide workspace tiles and paint status chips outside More Filters'
  );
  assert.ok(
    !/groupHtml\('Workspace Filters'/.test(app) &&
      !/groupHtml\('Equipment Expiry Filters'/.test(app) &&
      !/title\.innerHTML = '<strong>Workspace Filters<\/strong>/.test(app),
    label + ' must not render workspace or expiry filter groups'
  );
  assert.ok(
    !/id="dashboardMetrics"/.test(html) &&
      /id="fireSGatewayStatusFilters"/.test(html),
    label + ' must keep All / Action required / Compliant / Scheduled / Overdue / This Month outside More Filters'
  );
  assert.ok(
    /#fireSGatewayStatusFilters/.test(css) &&
      /#filterPanel \.metric-card/.test(css),
    label + ' must hide leftover tiles and span status chips across the Gateway width'
  );
}

assertSharedFilterLayout('Toets', stagingApp, stagingHtml, stagingCss);
assertSharedFilterLayout('Live', liveApp, liveHtml, liveCss);

assert.ok(
  /Version 1\.3\.58/.test(liveHtml) &&
    /1\.3\.64-toets/.test(stagingHtml),
  'Live displayed version stays 1.3.58; toets stays 1.3.64-toets'
);

assert.ok(
  /Choose a date range or tap a quick date filter/.test(stagingApp) &&
    /Choose a date range or tap a quick date filter/.test(liveApp),
  'More Filters heading must describe date filters only'
);

assert.ok(
  /#inspectionDateFilterPanel \.inspection-quick-date-row button/.test(stagingCss) &&
    /#inspectionDateFilterPanel \.inspection-quick-date-row button/.test(liveCss) &&
    /width: 100% !important/.test(stagingCss) &&
    /width: 100% !important/.test(liveCss),
  'Status chips and date filters must span the full Gateway width'
);

console.log('more-filters-date-only.test.js: ok');
