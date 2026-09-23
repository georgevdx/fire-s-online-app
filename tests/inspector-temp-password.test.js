'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const html = read('staging/index.html');
const team = read('staging/fire-s-company-team.js');
const subscribe = read('staging/fire-s-subscribe.js');
const change = read('staging/fire-s-change-password.js');
const roles = read('staging/fire-s-clean-home-roles.js');
const sql = read('STAGING_STAFF_TEMP_PASSWORD.sql');
const bootstrap = read('STAGING_BOOTSTRAP.sql');
const env = read('staging/fire-s-env.js');
const liveHtml = read('index.html');
const liveTeam = read('fire-s-company-team.js');

assert.ok(
  /id="fireSSeatPassword"/.test(html) &&
    /id="fireSSeatPassword2"/.test(html) &&
    /Temporary password/.test(html) &&
    /Confirm temporary password/.test(html),
  'Owner must type a temporary password twice when subscribing an inspector email'
);
assert.ok(
  /p_password: password/.test(team) &&
    /Type a temporary password twice so they can Login/.test(team) &&
    /status === 'created'/.test(team),
  'Personnel must send the temporary password to Fire-S Test and tell the owner after a new login is created'
);
assert.ok(
  /The two temporary passwords do not match/.test(subscribe) &&
    /fireSSeatPassword/.test(subscribe),
  'Subscribe this email must refuse a missing or unmatched temporary password'
);
assert.ok(
  /fire_s_insert_staff_auth_user/.test(sql) &&
    /must_change_password/.test(sql) &&
    /p_password text default null/.test(sql) &&
    /Do NOT run this on fireye-sync/.test(sql) &&
    /fire_s_clear_must_change_password/.test(sql),
  'Fire-S Test SQL must create the staff login with a bcrypt password and a must-change flag'
);
assert.ok(
  /fire_s_insert_staff_auth_user/.test(bootstrap) &&
    /must_change_password boolean/.test(bootstrap) &&
    /p_password text default null/.test(bootstrap),
  'A fresh Fire-S Test bootstrap must include the staff temporary password login'
);
assert.ok(
  /id="cmdChangePasswordBtn"/.test(html) &&
    /id="fireSChangePasswordSection"/.test(html) &&
    /id="fireSChangePassword"/.test(html) &&
    /id="fireSChangePassword2"/.test(html) &&
    /Save password/.test(html),
  'Home must offer Change password with confirm fields'
);
assert.ok(
  /updateUser\(\{[\s\S]*password: password[\s\S]*must_change_password: false/.test(change) &&
    /window\.fireSOpenChangePassword = openChangePassword/.test(change) &&
    /window\.fireSMaybeForceChangePassword = maybeForceChangePassword/.test(change),
  'A signed-in person must save a new password with confirm and clear the temporary-password flag'
);
assert.ok(
  /cmdChangePasswordBtn/.test(roles) &&
    /applyInspectorHome[\s\S]*cmdChangePasswordBtn/.test(roles) &&
    /applyViewerHome[\s\S]*cmdChangePasswordBtn/.test(roles) &&
    /applyOwnerHome[\s\S]*cmdChangePasswordBtn/.test(roles),
  'Inspector, Viewer and Owner Home must show Change password'
);
assert.ok(
  /Choose your own password/.test(change) &&
    /Your owner gave you a temporary password/.test(change),
  'After Login with a temporary password the inspector must choose and confirm a new one'
);
assert.ok(/1\.3\.113-toets/.test(env), 'Toets-blad version must be 1.3.113-toets for this password flow');
assert.ok(
  !/id="fireSSeatPassword"/.test(liveHtml) &&
    !/id="cmdChangePasswordBtn"/.test(liveHtml) &&
    !/p_password: password/.test(liveTeam),
  'Live must stay unchanged until sit dit live'
);

console.log('inspector-temp-password.test.js: ok');
