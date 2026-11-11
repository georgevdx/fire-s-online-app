'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const manual = read('staging/fire-s-user-manual.js');
const html = read('staging/index.html');
const env = read('staging/fire-s-env.js');
const liveEnv = read('fire-s-env.js');

assert.ok(/1\.3\.130-toets/.test(env), 'Toets-blad version must stay on 1.3.130-toets');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.67'/.test(liveEnv),
  'Live Fire-S must be 1.3.67 after sit dit live'
);

assert.ok(
  /Phone, laptop and Sync Now/.test(manual) &&
    /Sync Now brings the cloud list down first/.test(manual) &&
    /It keeps the company/.test(manual) &&
    /All changes synced\./.test(manual) &&
    /Compliant Sites/.test(manual) &&
    /Do not use Upload only to push an old local list/.test(manual) &&
    /Recycle Bin/.test(manual) &&
    /does not come back on the next sync/.test(manual),
  'Toets user manual must explain Sync Now, the company list, and a removed premises'
);

assert.ok(
  /Review &amp; Finalise/.test(manual) &&
    /does not make you fill the checklist again/.test(manual) &&
    /Review Inspection/.test(manual) &&
    /Continue Editing/.test(manual) &&
    /only for a checklist that is complete and not yet finalised/.test(manual),
  'Toets user manual must say Review & Finalise opens the answers already filled'
);

assert.ok(
  /fire-s-user-manual\.js\?v=1-51-phone-laptop/.test(html),
  'Toets-blad must load the updated user manual'
);
