'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const subscribe = read('staging/fire-s-subscribe.js');
const sql = read('STAGING_SEAT_AFTER_PAYMENT.sql');
const migration = read('supabase/migrations/20261105190000_fire_s_seat_after_payment.sql');
const itn = read('supabase/functions/payfast-itn/index.js');
const checkout = read('supabase/functions/payfast-checkout/index.js');
const liveSubscribe = read('fire-s-subscribe.js');

assert.strictEqual(sql, migration, 'SQL Editor copy must match the migration');

assert.ok(
  /function inviteSeatBeforePayment\(/.test(subscribe) &&
    /FIRE_S_ENV\.isStaging/.test(subscribe) &&
    /function subscribeSeatAfterPayment\(/.test(subscribe),
  'Toets may invite before PayFast. Production waits for payment.'
);
const afterPayment = subscribe.slice(
  subscribe.indexOf('async function subscribeSeatAfterPayment'),
  subscribe.indexOf('async function subscribeSeat()')
);
assert.ok(
  /PayFast did not open\. This email was not invited\./.test(afterPayment) &&
    !/fireSAddPersonnelSeat/.test(afterPayment),
  'Production seat checkout must not write Personnel before PayFast opens'
);
assert.ok(
  /if \(!inviteSeatBeforePayment\(\)\) \{\s*await subscribeSeatAfterPayment\(email, role\);/.test(
    subscribe
  ) && /fireSAddPersonnelSeat\(email, role\)/.test(subscribe),
  'Toets still invites the email before it tries PayFast'
);

assert.ok(
  /Seat invite waits for a completed payment/.test(sql) &&
    /payment_status = 'COMPLETE'/.test(sql) &&
    /insert into public\.company_invites/.test(sql),
  'The invite is written only after a completed PayFast payment'
);
assert.ok(
  /does not delete inspections/i.test(sql) && !/delete from public\.inspections/.test(sql),
  'Seat payment must not delete inspections'
);
assert.ok(
  /grant execute on function public\.fire_s_grant_paid_seat\(text\) to service_role/.test(sql) &&
    /revoke all on function public\.fire_s_grant_paid_seat\(text\) from authenticated/.test(sql),
  'Only the PayFast service may invite a paid seat'
);

assert.ok(
  /planCode === 'seat'/.test(itn) &&
    /paymentStatus \|\| ''\)\.toUpperCase\(\) === 'COMPLETE'/.test(itn) &&
    /fire_s_grant_paid_seat/.test(itn),
  'ITN invites a seat only when PayFast reports COMPLETE'
);
assert.ok(
  /p_seat_email: checkout\.seatEmail/.test(checkout) &&
    /could not find the function\|PGRST202\|schema cache/.test(checkout),
  'Checkout stores the seat email and still starts if that SQL is not applied yet'
);

assert.ok(
  !/function subscribeSeatAfterPayment\(/.test(liveSubscribe),
  'Live Fire-S stays unchanged until sit dit live'
);

console.log('seat-after-payment.test.js: ok');
