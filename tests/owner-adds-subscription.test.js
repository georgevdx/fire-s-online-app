'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const started = read('staging/fire-s-get-started.js');
const roles = read('staging/fire-s-clean-home-roles.js');
const team = read('staging/fire-s-company-team.js');
const html = read('staging/index.html');
const manual = read('staging/fire-s-user-manual.js');
const env = read('staging/fire-s-env.js');

assert.ok(
  /if \(isJoiningAsStaff\(\)\) return false;/.test(started) &&
    /role === 'pending_member'/.test(started) &&
    /if \(isStagingEnv\(\)\) return true;/.test(started),
  'Invited staff must not Subscribe; first owner on the toets-blad still can'
);
assert.ok(
  /Your owner already added you and pays for this email/.test(started) &&
    /Do not Subscribe/.test(started),
  'After Create password the staff path must wait or join, not open Subscribe'
);
assert.ok(
  /if \(role === 'pending_member'\) \{\s*showWaiting\(\);/.test(started),
  'pending_member on the toets-blad must not open the Subscribe form'
);
assert.ok(
  /actual === 'inspector'/.test(roles) &&
    /return 'pending_member'/.test(roles) &&
    /You do not Subscribe/.test(roles),
  'Staging must not treat an invited inspector as a new company owner'
);
assert.ok(
  /How a remote Inspector \/ Manager joins/.test(html) &&
    /You tap Add inspector \/ manager/.test(html) &&
    /Subscribe this email/.test(html) &&
    /They must <strong>not<\/strong> tap Subscribe/.test(html),
  'Personnel must show the owner the remote-join map'
);
assert.ok(
  /They must not Subscribe/.test(team),
  'After Add the owner must be told staff do not Subscribe'
);
assert.ok(
  /Inspectors and managers never Subscribe/.test(manual) &&
    /Tap <strong>Add inspector \/ manager<\/strong>/.test(manual) &&
    /Subscribe this email/.test(manual) &&
    /They can work remotely/.test(manual),
  'User manual must explain owner Add vs remote Create password'
);
assert.ok(
  /1\.3\.2\d-toets/.test(env),
  'Toets-blad version must stay on 1.3.20-toets or newer'
);

console.log('owner-adds-subscription.test.js: ok');
