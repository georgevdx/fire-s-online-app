'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const team = read('staging/fire-s-company-team.js');
const sql = read('SUPABASE_reopen_cancelled_invite.sql');
const bootstrap = read('STAGING_BOOTSTRAP.sql');
const env = read('staging/fire-s-env.js');

assert.ok(
  /function reopenCancelledInvite\(/.test(team),
  'Personnel must know how to put a cancelled invite back'
);
assert.ok(
  /function isClosedInviteStatus\(/.test(team) &&
    /cancelled/.test(team) &&
    /canceled/.test(team),
  'Cancelled invite spelling variants must count as closed'
);
assert.ok(
  /function forgetSeatEmail\(/.test(team) &&
    /Invite cancelled\. You can add that email again/.test(team),
  'Cancelling an invite must free that email so it can be added again'
);
assert.ok(
  /data-invite-email/.test(team),
  'Cancel invite button must keep the email so it can be forgotten'
);
assert.ok(
  /reopenedEarly = await reopenCancelledInvite/.test(team) &&
    /reopened = await reopenCancelledInvite/.test(team),
  'Add person must reopen a cancelled invite instead of blocking the email'
);
assert.ok(
  /1\.3\.(1[5-9]|2\d)-toets/.test(env),
  'Toets-blad must stay on 1.3.15-toets or newer with cancelled-invite reopen'
);

assert.ok(
  /cancelled', 'canceled', 'expired'/.test(sql) &&
    /set status = 'pending'/.test(sql),
  'SQL must reopen a cancelled invite as pending'
);
assert.ok(
  /unique_violation/.test(sql),
  'SQL must recover when the old unique row blocks a second insert'
);
assert.ok(
  /cancelled', 'canceled', 'expired'/.test(bootstrap),
  'Fire-S Test bootstrap must reopen cancelled invites'
);

console.log('reopen-cancelled-invite.test.js: ok');
