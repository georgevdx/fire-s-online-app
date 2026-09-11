'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertScheduleBookView(label, app, css, html) {
  assert.ok(
    /function enterFireSScheduleView\(/.test(app) &&
      /function exitFireSScheduleView\(/.test(app) &&
      /document\.body\.classList\.add\('fire-s-schedule-view'\)/.test(app) &&
      /openSchedulePanel\([\s\S]*\{ force: true \}\)/.test(app) &&
      /currentFilter = 'scheduled-new'/.test(app) &&
      /fireSScheduleBookViewLock/.test(app) &&
      /keepBookedCardsOnly/.test(app) &&
      /fireSKeepScheduleBookedCards/.test(app) &&
      /window\.fireSIsScheduledNewPremises = fireSIsScheduledNewPremises/.test(app) &&
      /Nothing booked yet\. Choose New site or Existing site above\./.test(app),
    label + ': Schedule Home card must open the booking form, not the Gateway card pile'
  );
  assert.ok(
    /function openSchedulePanel\(mode, options\)/.test(app) &&
      /const force = !!\(options && options\.force\)/.test(app),
    label + ': Home must be able to force the schedule panel open'
  );
  assert.ok(
    /body\.fire-s-schedule-view #scheduleNewPanel/.test(css) &&
      /body\.fire-s-schedule-view #fireSGatewayStatusFilters/.test(css) &&
      /body\.fire-s-schedule-view #newProjectBtn/.test(css) &&
      /schedule-booked-heading/.test(css) &&
      /body\.fire-s-schedule-view #projectsList \.fire-s-136a8-filter-grid/.test(css) &&
      /body\.fire-s-schedule-view #fireSCurrentKpiFilterBanner/.test(css),
    label + ': schedule view must show the book form and hide Gateway chrome'
  );
  assert.ok(
    /id="scheduleBookedHeading"/.test(html) &&
      /id="scheduleModeNewBtn"/.test(html) &&
      /id="scheduleModeExistingBtn"/.test(html),
    label + ': New site / Existing site must stay the schedule choice'
  );
}

assertScheduleBookView('Live', read('app.js'), read('styles.css'), read('index.html'));
assertScheduleBookView(
  'Toets',
  read('staging/app.js'),
  read('staging/styles.css'),
  read('staging/index.html')
);

console.log('schedule-home-book-view.test.js: ok');
