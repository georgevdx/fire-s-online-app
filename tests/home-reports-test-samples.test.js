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
  'Reports card must be allowed on Home'
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
  'Home roles must not hide Reports'
);
assert.ok(
  /fire-s-role-owner #cmdReportsBtn[\s\S]*display: block !important/.test(rolesCss),
  'Owner CSS must show Reports'
);
assert.ok(
  /fire-s-role-owner #cmdTestSamplesBtn[\s\S]*display: none !important/.test(rolesCss),
  'Owner CSS must hide Test samples'
);
assert.ok(
  /Home has a <strong>Reports<\/strong> button/.test(manual),
  'User manual must mention the Reports button'
);
assert.ok(
  /hidden on Home so clients do not see it/.test(manual),
  'User manual must say Test samples is hidden on Home'
);
assert.ok(
  /cmdTestSamplesBtn/.test(html),
  'Test samples markup can remain in the page'
);

console.log('home-reports-test-samples.test.js ok');
