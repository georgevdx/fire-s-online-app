'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

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
  /function fireSCompanyFromClaimRpc\(/.test(app) &&
    /const membership = loadedMembership \|\| claimedMembership/.test(app) &&
    /status\.eq\.active,status\.is\.null/.test(app),
  'Profile load must keep the company claim returned, including a blank membership status'
);
assert.ok(
  /var waitingNote = ''/.test(started) &&
    /if \(waitingNote\) setStatus\(waitingNote, waitingNoteError\)/.test(started) &&
    /function joinFailMessage\(/.test(started) &&
    /Signed in as /.test(started),
  'Check again must leave the signed-in email and the real reason on Almost ready'
);
assert.ok(
  /raw_user_meta_data ->> 'email'/.test(sql) &&
    /raw_user_meta_data ->> 'email'/.test(bootstrap) &&
    /coalesce\(status, 'active'\) <> 'active'/.test(sql),
  'Claim must match the login email and reactivate an inactive seat for that invite'
);
assert.ok(
  /auth\.jwt\(\) ->> 'email'/.test(sql) &&
    /Do NOT run this on fireye-sync/.test(sql) &&
    /auth\.jwt\(\) ->> 'email'/.test(bootstrap),
  'Fire-S Test SQL must join invited staff using the signed-in email'
);
assert.ok(/1\.3\.\d+-toets/.test(env), 'Toets-blad version must stay on 1.3.22-toets or newer');

const claimFn = app.match(/function fireSCompanyFromClaimRpc\(claimRes\) \{[\s\S]*?\n\}/);
assert.ok(claimFn, 'claim result parser must be present');
const claimSandbox = {};
vm.runInNewContext(
  claimFn[0] + '\nthis.fireSCompanyFromClaimRpc = fireSCompanyFromClaimRpc;',
  claimSandbox
);
const keptCompany = claimSandbox.fireSCompanyFromClaimRpc({
  data: [{ out_company_id: 'company-1', out_company_name: 'Acme Fire', out_role: 'inspector' }]
});
assert.strictEqual(keptCompany.company_id, 'company-1');
assert.strictEqual(keptCompany.role, 'inspector');
assert.strictEqual(keptCompany.companies.name, 'Acme Fire');
assert.strictEqual(claimSandbox.fireSCompanyFromClaimRpc({ data: [] }), null);
assert.strictEqual(
  claimSandbox.fireSCompanyFromClaimRpc({ data: [{ out_company_id: '  ' }] }),
  null
);
assert.ok(
  /appVersion: staging \? '1\.3\.27-toets' : '1\.3\.67'/.test(liveEnv),
  'Live Fire-S must be 1.3.67 after sit dit live'
);

console.log('inspector-join-after-password.test.js: ok');
