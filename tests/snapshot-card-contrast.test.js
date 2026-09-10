'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertSnapshotAndCards(label, app, css) {
  assert.ok(
    /stat\('Premises', data\.count, premisesHint/.test(app) &&
      /currently shown/.test(app) &&
      /stat\('Photos', data\.photos/.test(app) &&
      /on file/.test(app),
    label + ': Premises and Photos tiles must show a number plus a short label'
  );
  assert.ok(
    /<small>Last<\/small>/.test(app) &&
      /<small>Next<\/small>/.test(app) &&
      /<small>Actions<\/small>/.test(app) &&
      /<small>Photos<\/small>/.test(app),
    label + ': inspection cards must keep Last, Next, Actions and Photos headings'
  );
  assert.ok(
    /html\[data-fire-s-theme="dark"\] \.fire-s-exec-stat span/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.fire-s-exec-stat strong/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.fire-s-exec-grid \.fire-s-exec-stat\.neutral/.test(css),
    label + ': snapshot values must stay light on dark tiles'
  );
  assert.ok(
    /html\[data-fire-s-theme="dark"\] \.fire-s-136a8-card-top span/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.fire-s-136a8-card-meta small/.test(css) &&
      /html\[data-fire-s-theme="dark"\] \.fire-s-136a8-card-meta b/.test(css),
    label + ': status pills and Last/Next/Actions/Photos headings must be readable in dark mode'
  );
  assert.ok(
    /\.fire-s-136a8-card-top span \{[\s\S]{0,220}font-size: 11px/.test(css) &&
      /\.fire-s-136a8-card-meta small \{[\s\S]{0,160}font-size: 10px/.test(css),
    label + ': status pill and meta headings must use a readable font size'
  );
}

assertSnapshotAndCards('Live', read('app.js'), read('styles.css'));
assertSnapshotAndCards('Toets', read('staging/app.js'), read('staging/styles.css'));

console.log('snapshot-card-contrast.test.js: ok');
