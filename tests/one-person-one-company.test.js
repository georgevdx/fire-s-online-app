'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('STAGING_ONE_COMPANY.sql');
const bootstrap = read('STAGING_BOOTSTRAP.sql');
const team = read('staging/fire-s-company-team.js');
const html = read('staging/index.html');
const env = read('staging/fire-s-env.js');
const reset = read('STAGING_RESET.sql');

assert.ok(
  /STOP\. Look at the TOP LEFT/.test(sql) && /Fire-S Test/.test(sql),
  'Cleanup SQL must refuse to run unless the page is Fire-S Test'
);
assert.ok(
  /fireye-sync/.test(sql) && /Do not run here/.test(sql),
  'Cleanup SQL must refuse the live cloud'
);
assert.ok(
  /georgevdx@gmail.com/.test(sql),
  'Cleanup SQL must keep the main account georgevdx@gmail.com'
);
assert.ok(
  /delete from public.company_members m/.test(sql) &&
    /m.company_id is distinct from v_keep_company/.test(sql),
  'Cleanup SQL must remove personnel from every company except george’s'
);
assert.ok(
  /company_members_one_active_user/.test(sql) &&
    /company_members_one_active_user/.test(bootstrap),
  'Cloud must lock one login to one active company'
);
assert.ok(
  /if v_existing is not null then/.test(sql) &&
    /set status = 'cancelled'/.test(sql),
  'Claim invite must not add a second company when the person already belongs to one'
);
assert.ok(
  /if v_existing = p_company_id then/.test(bootstrap) &&
    /already a paid seat/.test(bootstrap) &&
    /already belongs to a company/.test(bootstrap),
  'Same company is a paid seat; another company is blocked as one person / one company'
);
assert.ok(
  /One person is one company/.test(team) &&
    /already belongs to a company/.test(team),
  'Personnel must tell the owner when that email already belongs to a company'
);
assert.ok(
  /One person is one company/.test(html),
  'Subscribe and Personnel copy must say one person is one company'
);
assert.ok(
  /1\.3\.(1[6-9]|2\d)-toets/.test(env),
  'Toets-blad version must stay on 1.3.16-toets or newer'
);
assert.ok(
  /johandb@live.com/.test(reset) && /georgevdx@gmail.com/.test(reset),
  'Full reset SQL must still keep the real logins'
);

console.log('one-person-one-company.test.js: ok');
