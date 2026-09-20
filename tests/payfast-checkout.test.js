'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('SUPABASE_payfast_checkout.sql');
const migration = read('supabase/migrations/20260916143000_fire_s_begin_payfast_checkout.sql');
const checkout = read('supabase/functions/payfast-checkout/index.js');
const sign = read('supabase/functions/_shared/payfast-sign.js');
const client = read('staging/fire-s-payfast.js');

assert.strictEqual(sql, migration, 'SQL Editor copy must match the migration');

assert.ok(/fire_s_begin_payfast_checkout/.test(sql));
assert.ok(/status = 'payment_pending'/.test(sql));
assert.ok(/activated', false/.test(sql) || /'activated', false/.test(sql));
assert.ok(/Authoritative amount mismatch/.test(sql));
assert.ok(/grant execute on function public\.fire_s_begin_payfast_checkout[\s\S]*to service_role/.test(sql));
assert.ok(/revoke all on function public\.fire_s_begin_payfast_checkout[\s\S]*from authenticated/.test(sql));
assert.ok(!/grant execute on function public\.fire_s_begin_payfast_checkout\([^)]+\) to authenticated/.test(sql));
assert.ok(!/fire_s_activate_paid_subscription/.test(sql));
assert.ok(!/delete from public\.inspections/.test(sql));
assert.ok(/CHECKOUT_STARTED/.test(sql));

assert.ok(/assertSandboxCheckout/.test(checkout));
assert.ok(/fire_s_begin_payfast_checkout/.test(checkout));
assert.ok(/beginPending/.test(checkout));
assert.ok(/resolveAuthoritativeCheckout/.test(checkout));
assert.ok(/activates_on_return_url: false/.test(checkout));
assert.ok(!/fire_s_activate_paid_subscription/.test(checkout));
assert.ok(/SUPABASE_SERVICE_ROLE_KEY/.test(checkout));
assert.ok(/Only the Owner can pay on PayFast/.test(checkout));
assert.ok(/already exists/.test(checkout), 'checkout must reactivate an existing company, not ask to create one');
assert.ok(!/Create your company first/.test(checkout));
assert.ok(/company_members/.test(checkout), 'checkout must fall back to company_members');
assert.ok(/super_admin/.test(checkout), 'Super Admin must be able to pay for a cancelled company');
assert.ok(/exception when others/.test(sql), 'missing sync must not block cancelled checkout');
assert.ok(/Cancelled \/ expired companies must be able to start PayFast again/.test(sql));

assert.ok(/Never read amount, price, plan, companyId or mPaymentId from the browser/.test(sign));
assert.ok(/assertSandboxCheckout/.test(sign));
assert.ok(/function payfastBuyerEmail/.test(sign));
assert.ok(/fires-toets-buyer@example\.com/.test(sign), 'sandbox must not pay from the merchant email');
assert.ok(/function merchantPaysSelf\(/.test(client), 'old checkout HTML must not post the merchant email to PayFast');
assert.ok(/same-account/.test(client));

assert.ok(!/cat\.markPaid/.test(client));
assert.ok(/Access updates when the server confirms/.test(client));
assert.ok(/functions\/v1/.test(client));

const fetchBody = client.match(/body:\s*JSON\.stringify\(\{[\s\S]*?\}\)/);
assert.ok(fetchBody);
assert.ok(!/amount/.test(fetchBody[0]));
assert.ok(!/companyId/.test(fetchBody[0]));
assert.ok(!/mPaymentId/.test(fetchBody[0]));

console.log('payfast-checkout.test.js: ok');
