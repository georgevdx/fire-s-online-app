'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertQaExpand(label, app, css) {
  assert.ok(
    /class="checklist-expand-btn"/.test(app) &&
      /function revealExpandedChecklistInFrame\(/.test(app) &&
      /scheduleRevealExpandedChecklistInFrame\(\);/.test(app) &&
      !/class="section-group hidden"/.test(app),
    label + ': Q&A must start expanded with visible Expand / Collapse'
  );
  assert.ok(
    /button\.checklist-expand-btn[\s\S]*min-height: 44px !important/.test(css),
    label + ': Expand / Collapse must stay large'
  );
}

function assertScheduleBook(label, app, html, css) {
  assert.ok(
    /function enterFireSScheduleView\(/.test(app) &&
      /function fireSScheduleBookViewLock/.test(app) &&
      /Nothing booked yet/.test(app),
    label + ': Home Schedule must open the booking view'
  );
  assert.ok(
    /id="scheduleBookedHeading"/.test(html) &&
      /body\.fire-s-schedule-view #projectSearch/.test(css),
    label + ': Schedule view must hide leftover Gateway chrome'
  );
}

function assertLegalLinks(label, css, startedCss, html) {
  assert.ok(
    /Open Terms and conditions/.test(html) &&
      /Open Privacy policy/.test(html),
    label + ': Access must keep the two legal buttons at the bottom'
  );
  assert.ok(
    /\.fire-s-legal-links a[\s\S]*background: #1d4ed8/.test(startedCss) &&
      /\.fire-s-legal-links a[\s\S]*color: #ffffff/.test(startedCss),
    label + ': Terms and Privacy buttons must use white text on blue'
  );
  assert.ok(
    /html\[data-fire-s-theme="dark"\] \.fire-s-legal-links a[\s\S]*color: #ffffff !important/.test(css) ||
      /html\[data-fire-s-theme="dark"\] \.fire-s-legal-links a[\s\S]*color: #ffffff !important/.test(startedCss),
    label + ': Dark Mode must not paint legal-button text white-on-white'
  );
}

assertQaExpand('Live', read('app.js'), read('styles.css'));
assertQaExpand('Toets', read('staging/app.js'), read('staging/styles.css'));
assertScheduleBook('Live', read('app.js'), read('index.html'), read('styles.css'));
assertScheduleBook('Toets', read('staging/app.js'), read('staging/index.html'), read('staging/styles.css'));
assertLegalLinks('Live', read('styles.css'), read('fire-s-get-started.css'), read('index.html'));
assertLegalLinks(
  'Toets',
  read('staging/styles.css'),
  read('staging/fire-s-get-started.css'),
  read('staging/index.html')
);

assert.ok(
  /Version 1\.3\.65/.test(read('index.html')) &&
    /1\.3\.65/.test(read('fire-s-env.js')) &&
    /1\.3\.78-toets/.test(read('staging/index.html')) &&
    /1\.3\.78-toets/.test(read('staging/fire-s-env.js')),
  'Live must show 1.3.65 and toets 1.3.78-toets so a phone can tell it has this sit'
);

console.log('sit-live-qa-access.test.js: ok');
