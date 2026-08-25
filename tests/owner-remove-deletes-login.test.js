'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('STAGING_OWNER_REMOVE.sql');
const bootstrap = read('STAGING_BOOTSTRAP.sql');
const team = read('staging/fire-s-company-team.js');
const html = read('staging/index.html');
const env = read('staging/fire-s-env.js');
const reset = read('STAGING_RESET.sql');

assert.ok(
  /STOP\. Look at the TOP LEFT/.test(sql) && /Fire-S Test/.test(sql),
  'Owner-remove SQL must refuse to run unless the page is Fire-S Test'
);
assert.ok(
  /fireye-sync/.test(sql) && /Do not run here/.test(sql),
  'Owner-remove SQL must refuse the live cloud'
);
assert.ok(
  /delete from auth.users where id = p_user_id/.test(sql) &&
    /delete from auth.users where id = p_user_id/.test(bootstrap) &&
    /delete from auth.identities/.test(sql),
  'Remove must delete the cloud login (email and password)'
);
assert.ok(
  /Only the Owner can remove personnel/.test(sql) &&
    /fire_s_is_company_owner/.test(sql) &&
    /fire_s_is_company_owner/.test(bootstrap),
  'Only the owner may remove someone from personnel'
);
assert.ok(
  /georgevdx@gmail.com/.test(sql) &&
    /johandb@live.com/.test(sql) &&
    /login_deleted', false/.test(sql),
  'Kept logins must not be deleted from the cloud'
);
assert.ok(
  /Only that Owner can remove you under Personnel/.test(sql) &&
    /Only that Owner can remove you under Personnel/.test(bootstrap),
  'A person still on a company must not Subscribe somewhere else'
);
assert.ok(
  /function canRemovePerson\(/.test(team) &&
    /Their email and password will be deleted from the cloud/.test(team) &&
    /Then they can Subscribe under another company name/.test(team),
  'Personnel Remove must warn that the cloud login is deleted'
);
assert.ok(
  /Only you \(the owner\) can Remove someone/.test(html) &&
    /deletes their email and password from the cloud/.test(html),
  'Personnel copy must say only the owner can free someone for another company'
);
assert.ok(
  /1\.3\.(1[7-9]|2\d)-toets/.test(env),
  'Toets-blad version must stay on 1.3.17-toets or newer with owner-remove'
);
assert.ok(
  /johandb@live.com/.test(reset) && /georgevdx@gmail.com/.test(reset),
  'Full reset SQL must still keep the real logins'
);

console.log('owner-remove-deletes-login.test.js: ok');
