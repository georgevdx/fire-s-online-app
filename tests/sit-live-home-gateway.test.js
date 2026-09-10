'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
const liveApp = read('app.js');
const stagingApp = read('staging/app.js');
const liveCss = read('styles.css');
const stagingCss = read('staging/styles.css');
const liveListsCss = read('fire-s-owner-lists.css');
const stagingListsCss = read('staging/fire-s-owner-lists.css');
const liveEnv = read('fire-s-env.js');
const stagingEnv = read('staging/fire-s-env.js');

function assertDateAboveChips(label, html, app) {
  const dateAt = html.indexOf('id="inspectionDateFilterPanel"');
  const chipsAt = html.indexOf('id="fireSGatewayStatusFilters"');
  assert.ok(
    dateAt > 0 && chipsAt > dateAt,
    label + ': Inspection Date filter must sit just above the six status chips'
  );
  assert.ok(
    /statusHost\.insertAdjacentElement\('beforebegin', datePanel\)/.test(app),
    label + ': leftover scripts must put the date panel back above the chips'
  );
}

assertDateAboveChips('Live', liveHtml, liveApp);
assertDateAboveChips('Toets', stagingHtml, stagingApp);

assert.ok(
  /function fireSInspectionFilterDate\(/.test(liveApp) &&
    /function fireSInspectionFilterDate\(/.test(stagingApp),
  'Today must use the inspection date on live and toets'
);
assert.ok(
  !/fireyeProjects-staging/.test(liveApp) &&
    /function getProjects\(\) \{\n  const saved = localStorage\.getItem\('fireyeProjects'\);/.test(liveApp),
  'Live must keep the fireyeProjects store'
);
assert.ok(
  /id="fireSThemeLightBtn"/.test(liveHtml) &&
    /id="fireSThemeDarkBtn"/.test(liveHtml) &&
    /fireSApplyStoredTheme/.test(liveHtml) &&
    /function fireSAppearanceChoice/.test(liveApp),
  'Live must have Light / Dark appearance'
);
assert.ok(
  /html\[data-fire-s-theme="dark"\]/.test(liveCss) &&
    /html\[data-fire-s-theme="light"\] body/.test(liveCss) &&
    /html\[data-fire-s-theme="dark"\] \.fs-prod-kpi-card/.test(liveCss) &&
    /html\[data-fire-s-theme="dark"\] \.fire-s-owner-lists-block h4/.test(liveListsCss),
  'Dark mode must use light text on dark Home blocks, and light mode must keep dark text'
);
assert.ok(
  /#mainCommandCentre \.fire-s-owner-lists-block/.test(liveCss) &&
    /#mainCommandCentre \.fire-s-owner-lists-block/.test(stagingCss) &&
    /border-radius: 14px/.test(liveListsCss) &&
    /border-radius: 14px/.test(stagingListsCss),
  'Home section blocks must have neat frames on live and toets'
);
assert.ok(
  /Version 1\.3\.61/.test(liveHtml) &&
    /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.61'/.test(liveEnv) &&
    /1\.3\.69-toets/.test(stagingHtml) &&
    /1\.3\.69-toets/.test(stagingEnv),
  'Live must show 1.3.61 and toets 1.3.69-toets so a phone can tell it has this build'
);

console.log('sit-live-home-gateway.test.js: ok');
