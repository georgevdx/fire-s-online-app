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

assert.ok(
  /id="inspectionDateFilterPanel"/.test(stagingHtml) &&
    /data-date-filter="today"/.test(stagingHtml) &&
    /data-date-filter="week"/.test(stagingHtml) &&
    /data-date-filter="month"/.test(stagingHtml) &&
    /data-date-filter="quarter"/.test(stagingHtml) &&
    /data-date-filter="year"/.test(stagingHtml) &&
    /id="inspectionDateFrom"/.test(stagingHtml) &&
    /id="inspectionDateTo"/.test(stagingHtml),
  'More Filters must keep the Inspection Date filter panel'
);

assert.ok(
  /function fireSHideMoreFiltersNonDateTiles\(/.test(stagingApp),
  'Toets More Filters must hide workspace and expiry tiles'
);

assert.ok(
  !/groupHtml\('Workspace Filters'/.test(stagingApp) &&
    !/groupHtml\('Equipment Expiry Filters'/.test(stagingApp),
  'Toets More Filters must not render workspace or expiry filter groups'
);

assert.ok(
  !/title\.innerHTML = '<strong>Workspace Filters<\/strong>/.test(stagingApp),
  'Toets More Filters must not inject the Workspace Filters heading'
);

assert.ok(
  /Choose a date range or tap a quick date filter/.test(stagingApp),
  'More Filters heading must describe date filters only'
);

assert.ok(
  /#dashboardMetrics\.fire-s-more-filters-date-only/.test(stagingCss),
  'Date-only More Filters must hide the empty workspace metrics strip'
);

console.log('more-filters-date-only.test.js: ok');
