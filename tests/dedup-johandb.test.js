'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('STAGING_DEDUP_JOHANDB.sql');
const team = read('staging/fire-s-company-team.js');
const env = read('staging/fire-s-env.js');
const reset = read('STAGING_RESET.sql');

assert.ok(
  /STOP\. Look at the TOP LEFT/.test(sql) && /Fire-S Test/.test(sql),
  'Dedup SQL must refuse to run unless the page is Fire-S Test'
);
assert.ok(
  /fireye-sync/.test(sql) && /Do not run here/.test(sql),
  'Dedup SQL must refuse the live cloud'
);
assert.ok(
  /johandb@live.com/.test(sql) && /georgevdx@gmail.com/.test(sql),
  'Dedup SQL must keep one johandb login on george’s company'
);
assert.ok(
  /delete from auth.users where id = v_extra/.test(sql),
  'Extra johandb logins must be deleted from the cloud'
);
assert.ok(
  /johandb_logins_left/.test(sql) && /johandb_memberships_left/.test(sql),
  'SQL must show how many johandb rows remain'
);
assert.ok(
  /function uniqueActiveMembers\(/.test(team) &&
    /function invitesNotOnTeam\(/.test(team),
  'Personnel must not show the same email twice'
);
assert.ok(
  /1\.3\.1[8-9]-toets/.test(env),
  'Toets-blad version must stay on 1.3.18-toets or newer'
);
assert.ok(
  /johandb@live.com/.test(reset) && /georgevdx@gmail.com/.test(reset),
  'Full reset SQL must still keep the real logins'
);

console.log('dedup-johandb.test.js: ok');
