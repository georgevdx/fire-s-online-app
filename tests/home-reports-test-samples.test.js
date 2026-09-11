'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const app = read('app.js');
const rolesJs = read('fire-s-clean-home-roles.js');
const rolesCss = read('fire-s-clean-home-roles.css');
const html = read('index.html');
const manual = read('fire-s-user-manual.js');

assert.ok(
  /function shouldShowReportsCommandCard\(\) \{\s*return true;/.test(app),
  'Live Reports card stays on Home until sit live'
);
assert.ok(
  /currentFilter = 'completed'/.test(app),
  'Reports must open the completed inspections list'
);
assert.ok(
  /hide\('cmdTestSamplesBtn'\)/.test(rolesJs),
  'Home roles must hide Test samples'
);
assert.ok(
  !/hide\('cmdReportsBtn'\)/.test(rolesJs),
  'Live Home roles must not hide Reports'
);
assert.ok(
  /fire-s-role-owner #cmdReportsBtn[\s\S]*display: block !important/.test(rolesCss),
  'Live owner CSS must show Reports'
);
assert.ok(
  /fire-s-role-owner #cmdTestSamplesBtn[\s\S]*display: none !important/.test(rolesCss),
  'Owner CSS must hide Test samples'
);
assert.ok(
  /Home has a <strong>Reports<\/strong> button/.test(manual),
  'Live user manual must mention the Reports button'
);
assert.ok(
  /hidden on Home so clients do not see it/.test(manual),
  'User manual must say Test samples is hidden on Home'
);
assert.ok(
  /cmdTestSamplesBtn/.test(html),
  'Test samples markup can remain in the page'
);

const stagingApp = read('staging/app.js');
const stagingRolesJs = read('staging/fire-s-clean-home-roles.js');
const stagingRolesCss = read('staging/fire-s-clean-home-roles.css');
const stagingCss = read('staging/styles.css');
const stagingHtml = read('staging/index.html');
const stagingManual = read('staging/fire-s-user-manual.js');

assert.ok(
  /function shouldShowReportsCommandCard\(\) \{\s*return false;/.test(stagingApp),
  'Toets must take the Home Reports card away'
);
assert.ok(
  /if \(id === 'cmdReportsBtn'\) \{\s*hide\(id\);/.test(stagingRolesJs) &&
    /hide\('cmdReportsBtn'\)/.test(stagingRolesJs),
  'Toets Home roles must keep Reports hidden'
);
assert.ok(
  /html body #mainCommandCentre #cmdReportsBtn[\s\S]*display: none !important/.test(stagingCss) &&
    /html body #mainCommandCentre #cmdReportsBtn[\s\S]*display: none !important/.test(stagingRolesCss),
  'Toets CSS must hide the Home Reports card'
);
assert.ok(
  /id="cmdReportsBtn" hidden/.test(stagingHtml),
  'Toets Reports markup can remain, but starts hidden'
);
assert.ok(
  /function openLatestPremisesReport\(/.test(stagingApp) &&
    /Latest Report/.test(stagingApp) &&
    /Export PDF/.test(stagingApp),
  'A report still comes from the premises: Latest Report or Export PDF'
);
assert.ok(
  /There is no separate Reports card on Home/.test(stagingManual) &&
    !/Home has a <strong>Reports<\/strong> button/.test(stagingManual) &&
    !/Home → Reports/.test(stagingManual),
  'Toets manual must send people to the premises, not a Home Reports card'
);

console.log('home-reports-test-samples.test.js ok');
