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

function assertDateAndStatusLayout(label, app, html, css) {
  assert.ok(
    /id="inspectionDateFilterPanel"/.test(html) &&
      /data-date-filter="today"/.test(html) &&
      /id="inspectionDateFrom"/.test(html) &&
      /id="inspectionDateTo"/.test(html),
    label + ' must keep the Inspection Date filter panel'
  );
  assert.ok(
    /function fireSHideMoreFiltersNonDateTiles\(/.test(app) &&
      /function fireSPaintGatewayStatusFilters\(/.test(app) &&
      /function fireSRemoveMoreFiltersDrawer\(/.test(app),
    label + ' must hide workspace tiles, paint status chips, and remove More Filters'
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
    label + ' must keep All / Action required / Compliant / Scheduled / Overdue / This Month on the Gateway'
  );
  assert.ok(
    !/id="toggleFiltersBtn"/.test(html) &&
      !/id="filterPanel"/.test(html),
    label + ' must not keep the More Filters button or drawer in the page'
  );
  assert.ok(
    /#fireSGatewayStatusFilters/.test(css) &&
      /#toggleFiltersBtn/.test(css) &&
      /display: none !important/.test(css),
    label + ' must hide leftover More Filters chrome if an old script paints it'
  );
}

assertDateAndStatusLayout('Toets', stagingApp, stagingHtml, stagingCss);
assertDateAndStatusLayout('Live', liveApp, liveHtml, liveCss);

assert.ok(
  /Version 1\.3\.58/.test(liveHtml) &&
    /1\.3\.64-toets/.test(stagingHtml),
  'Live displayed version stays 1.3.58; toets stays 1.3.64-toets'
);

assert.ok(
  /#inspectionDateFilterPanel \.inspection-quick-date-row button/.test(stagingCss) &&
    /#inspectionDateFilterPanel \.inspection-quick-date-row button/.test(liveCss) &&
    /width: 100% !important/.test(stagingCss) &&
    /width: 100% !important/.test(liveCss),
  'Status chips and date filters must span the full Gateway width'
);

console.log('more-filters-date-only.test.js: ok');
