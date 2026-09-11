'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveLetter = read('fire-s-company-letterhead.js');
const stagingLetter = read('staging/fire-s-company-letterhead.js');
const liveCss = read('styles.css');
const stagingCss = read('staging/styles.css');

assert.ok(
  /function revealFireSScheduleBookingView\(/.test(liveApp) &&
    /function revealFireSScheduleBookingView\(/.test(stagingApp),
  'Schedule must scroll the existing-site form into view'
);
assert.ok(
  /setSchedulePanelMode\('existing'\)/.test(liveApp) &&
    /scheduleBookedHeading/.test(liveApp) &&
    /booked\.scrollIntoView/.test(liveApp),
  'Saving an existing-site booking must keep the form and scroll Already booked'
);
assert.ok(
  /if \(panel\) panel\.style\.display = 'none';/.test(liveApp.split('function saveScheduledExistingInspection')[1].slice(0, 1800)) === false,
  'Live existing-site save must not hide the Schedule form'
);
assert.ok(
  /if \(panel\) panel\.style\.display = 'none';/.test(stagingApp.split('function saveScheduledExistingInspection')[1].slice(0, 1800)) === false,
  'Toets existing-site save must not hide the Schedule form'
);
assert.ok(
  /body\.fire-s-schedule-view[\s\S]*overflow-y: auto !important/.test(liveCss) &&
    /body\.fire-s-schedule-view[\s\S]*overflow-y: auto !important/.test(stagingCss),
  'Schedule view must scroll so Already booked can sit below the form'
);

assert.ok(
  /#companyLetterheadSection \.company-letterhead-form[\s\S]*color: #0f172a !important/.test(liveCss) &&
    /#companyTeamSection \.company-team-card[\s\S]*color: #0f172a !important/.test(liveCss),
  'Company details fonts must be dark on the light paper in Dark Mode'
);

assert.ok(
  !/sample-company-s-logo\.svg/.test(liveHtml) &&
    !/companyLetterheadSampleLogoBtn/.test(liveHtml) &&
    !/company-letterhead-sample-display/.test(liveHtml),
  'Live Company details must not show the toets sample Company S logo'
);
assert.ok(
  /sample-company-s-logo\.svg/.test(stagingHtml) &&
    /companyLetterheadSampleLogoBtn/.test(stagingHtml),
  'Toets may keep the sample Company S logo for trying the PDF'
);

assert.ok(
  /STAGING_STORAGE_KEY = 'fireS\.companyLetterhead\.v1-staging'/.test(liveLetter) &&
    /STAGING_STORAGE_KEY = 'fireS\.companyLetterhead\.v1-staging'/.test(stagingLetter) &&
    /function migrateToetsAwayFromLiveKey\(/.test(liveLetter) &&
    /if \(key !== 'local'\) store\.local = record/.test(liveLetter) === false,
  'Letterhead must not share toets details into the live store or another company'
);
assert.ok(
  /isSampleCompanyLogoSrc\(logo\) && !isFireSStagingApp\(\)/.test(liveApp) &&
    /isSampleCompanyLogoSrc\(logo\) && !isFireSStagingApp\(\)/.test(stagingApp),
  'Live PDFs must not inherit the toets sample logo'
);
assert.ok(
  /fireS\.cachedCompany-staging/.test(read('staging/app.js')) &&
    /fireS\.cachedCompany-staging/.test(read('staging/fire-s-company-team.js')),
  'Toets company cache must not overwrite the live company cache'
);

console.log('schedule-company-isolate.test.js: ok');
