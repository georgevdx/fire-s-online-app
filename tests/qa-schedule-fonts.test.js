'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertQaScheduleFonts(label, css) {
  assert.ok(
    /#checklistCard \.checklist-expand-hint[\s\S]*color: #f8fafc !important/.test(css) &&
      /#checklistCard \.checklist-expand-hint[\s\S]*font-size: 16px !important/.test(css),
    label + ': Q&A expand hint must be large light type on the dark checklist card'
  );
  assert.ok(
    /#nextInspectionCard :is\(h3, h4, p, span, strong, small, label, div, legend\)[\s\S]*color: #0f172a !important/.test(css),
    label + ': Scheduling Centre type must stay dark on the white paper'
  );
  assert.ok(
    /#nextInspectionCard \.scheduling-card-header h3[\s\S]*color: #0b1220 !important/.test(css) &&
      /#nextInspectionCard \.schedule-option-card h4[\s\S]*-webkit-text-fill-color: #0b1220 !important/.test(css) &&
      /#nextInspectionCard \.schedule-option-card h4[\s\S]*font-weight: 900 !important/.test(css),
    label + ': Existing-Site / Corrective / Routine headings must be heavy near-black'
  );
  assert.ok(
    /#nextInspectionCard \.schedule-option-followup \.schedule-option-label[\s\S]*color: #b71c1c !important/.test(css) &&
      /#nextInspectionCard \.schedule-option-recurring \.schedule-option-label[\s\S]*color: #2e7d32 !important/.test(css),
    label + ': Corrective and Routine chips must keep their brand colours'
  );
}

assertQaScheduleFonts('Live styles', read('styles.css'));
assertQaScheduleFonts('Live fit-text', read('fire-s-fit-text.css'));
assertQaScheduleFonts('Live dark-type', read('fire-s-dark-type.css'));
assertQaScheduleFonts('Toets styles', read('staging/styles.css'));
assertQaScheduleFonts('Toets fit-text', read('staging/fire-s-fit-text.css'));
assertQaScheduleFonts('Toets dark-type', read('staging/fire-s-dark-type.css'));

assert.ok(
  /\.checklist-expand-hint \{[\s\S]*font-size: 16px/.test(read('styles.css')) &&
    /\.checklist-expand-hint \{[\s\S]*font-size: 16px/.test(read('staging/styles.css')),
  'Light Mode Q&A hint must also be larger dark type on live and toets'
);

assert.ok(
  /Questions are already open/.test(read('app.js')) &&
    /Questions are already open/.test(read('staging/app.js')),
  'Q&A must keep the already-open hint copy'
);

assert.ok(
  !/enterFireSScheduleView\(\)/.test(
    read('app.js').match(/function openInspectionsCommand\(\) \{[\s\S]*?\n\}/)?.[0] || ''
  ),
  'Inspection Gateway must not enter the Home Schedule booking view'
);

assert.ok(
  /styles\.css\?v=1-3-65-sitlive/.test(read('index.html')) &&
    /fire-s-fit-text\.css\?v=1-19-sitlive/.test(read('index.html')) &&
    /fire-s-dark-type\.css\?v=1-3-rephead/.test(read('index.html')),
  'Live must cache-bust Q&A and Scheduling Centre font CSS'
);

assert.ok(
  /styles\.css\?v=1-3-79-toets-comment/.test(read('staging/index.html')) &&
    /fire-s-fit-text\.css\?v=1-19-actovd/.test(read('staging/index.html')) &&
    /fire-s-dark-type\.css\?v=1-8-rephead/.test(read('staging/index.html')),
  'Toets must cache-bust the stronger Scheduling Centre headings'
);

assert.ok(
  /Version 1\.3\.65/.test(read('index.html')) &&
    /Version 1\.3\.79-toets/.test(read('staging/index.html')),
  'Displayed versions stay 1.3.65 live and 1.3.79-toets'
);

console.log('qa-schedule-fonts.test.js: ok');
