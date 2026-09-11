'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assertReportsHidden(label, app, rolesJs, rolesCss, html, manual) {
  assert.ok(
    /function shouldShowReportsCommandCard\(\) \{\s*return false;/.test(app),
    label + ': Reports card stays off Home'
  );
  assert.ok(
    /hide\('cmdReportsBtn'\)/.test(rolesJs) &&
      /if \(id === 'cmdReportsBtn'\) \{\s*hide\(id\);/.test(rolesJs),
    label + ': Home roles must hide Reports'
  );
  assert.ok(
    /fire-s-role-owner #cmdReportsBtn[\s\S]*display: none !important/.test(rolesCss) &&
      /html body #mainCommandCentre #cmdReportsBtn[\s\S]*display: none !important/.test(rolesCss),
    label + ': owner CSS must hide Reports'
  );
  assert.ok(
    /id="cmdReportsBtn"[^>]*hidden/.test(html),
    label + ': Reports button stays in the page but hidden'
  );
  assert.ok(
    /There is no separate Reports card on Home|There is no Reports card under Schedule/.test(manual),
    label + ': manual must send people to the premises for a PDF'
  );
}

assertReportsHidden(
  'Live',
  read('app.js'),
  read('fire-s-clean-home-roles.js'),
  read('fire-s-clean-home-roles.css'),
  read('index.html'),
  read('fire-s-user-manual.js')
);
assertReportsHidden(
  'Toets',
  read('staging/app.js'),
  read('staging/fire-s-clean-home-roles.js'),
  read('staging/fire-s-clean-home-roles.css'),
  read('staging/index.html'),
  read('staging/fire-s-user-manual.js')
);

assert.ok(
  /hide\('cmdTestSamplesBtn'\)/.test(read('fire-s-clean-home-roles.js')),
  'Home roles must hide Test samples'
);

console.log('home-reports-test-samples.test.js ok');
