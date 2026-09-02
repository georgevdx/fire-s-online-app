'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const started = read('staging/fire-s-get-started.js');
const env = read('staging/fire-s-env.js');
const app = read('staging/app.js');
const sql = read('STAGING_CLAIM_JOIN.sql');
const bootstrap = read('STAGING_BOOTSTRAP.sql');
const liveEnv = read('fire-s-env.js');

assert.ok(
  /function joinFromVisibleInvites\(/.test(started) &&
    /function joinCompanyAfterLogin\(/.test(started) &&
    /company_members'\)\.upsert/.test(started),
  'Create password must join the inspector to the company, not stop on Almost ready'
);
assert.ok(
  /await waitForAuthSession\(\)/.test(started) &&
    /for \(i = 0; i < 3; i \+= 1\)/.test(started),
  'Join must wait for the login session and retry Check again'
);
assert.ok(
  /8000/.test(app) && /fire_s_claim_my_invites/.test(app),
  'Membership load must give claim enough time after Create password'
);
assert.ok(
  /auth\.jwt\(\) ->> 'email'/.test(sql) &&
    /Do NOT run this on fireye-sync/.test(sql) &&
    /auth\.jwt\(\) ->> 'email'/.test(bootstrap),
  'Fire-S Test SQL must join invited staff using the signed-in email'
);
assert.ok(/1\.3\.[2-9]\d-toets/.test(env), 'Toets-blad version must stay on 1.3.22-toets or newer');
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.51'/.test(liveEnv),
  'Live Fire-S must be 1.3.51 after sit dit live'
);

console.log('inspector-join-after-password.test.js: ok');
