'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('SUPABASE_payfast_itn.sql');
const migration = read('supabase/migrations/20260916150000_fire_s_apply_payfast_itn.sql');
const handler = read('supabase/functions/_shared/payfast-itn-handler.js');
const verify = read('supabase/functions/_shared/payfast-itn-verify.js');
const index = read('supabase/functions/payfast-itn/index.js');
const configToml = read('supabase/config.toml');
const checkout = read('supabase/functions/payfast-checkout/index.js');
const client = read('staging/fire-s-payfast.js');

assert.strictEqual(sql, migration, 'SQL Editor copy must match the migration');

assert.ok(/fire_s_apply_payfast_itn/.test(sql));
assert.ok(/Unknown company or payment reference/.test(sql));
assert.ok(/Authoritative amount mismatch/.test(sql));
assert.ok(/already_processed/.test(sql));
assert.ok(/duplicate/.test(sql));
assert.ok(/for update/i.test(sql));
assert.ok(/ITN_COMPLETE/.test(sql));
assert.ok(/ITN_FAILED/.test(sql));
assert.ok(/ITN_CANCELLED/.test(sql));
assert.ok(/ITN_ALREADY_PROCESSED/.test(sql));
assert.ok(/keep_data', true/.test(sql) || /keep_data", true/.test(sql) || /'keep_data', true/.test(sql));
assert.ok(/deleted_inspections', false/.test(sql));
assert.ok(!/delete from public\.inspections/.test(sql));
assert.ok(!/drop table if exists public\.inspections/.test(sql));
assert.ok(/grant execute on function public\.fire_s_apply_payfast_itn[\s\S]*to service_role/.test(sql));
assert.ok(/revoke all on function public\.fire_s_apply_payfast_itn[\s\S]*from authenticated/.test(sql));
assert.ok(!/grant execute on function public\.fire_s_apply_payfast_itn\([^)]+\) to authenticated/.test(sql));
assert.ok(/status = 'active'/.test(sql));
assert.ok(/past_due/.test(sql));
assert.ok(/cancelled/.test(sql));
assert.ok(/payfast_subscription_token/.test(sql));
assert.ok(/current_period_end/.test(sql));
assert.ok(/2500/.test(sql) && /250/.test(sql));

assert.ok(/verify_jwt = false/.test(configToml));
assert.ok(/\[functions\.payfast-itn\]/.test(configToml));
assert.ok(/handlePayfastItn/.test(index));
assert.ok(/verify_jwt = true/.test(configToml));

assert.ok(/\/eng\/query\/validate/.test(verify));
assert.ok(/invalid_signature/.test(verify));
assert.ok(/wrong_amount/.test(verify));
assert.ok(/Do not continue if any step is incomplete/.test(verify));
assert.ok(/PAYFAST_VALID_HOSTS/.test(verify));
assert.ok(/md5hex/.test(verify));
assert.ok(!/merchant_key/.test(verify) || /merchant_key/.test(verify));

assert.ok(/ITN_REJECTED/.test(handler));
assert.ok(/ITN_APPLIED/.test(handler));
assert.ok(/ITN_DUPLICATE/.test(handler));
assert.ok(/fire_s_apply_payfast_itn/.test(handler));
assert.ok(/SUPABASE_SERVICE_ROLE_KEY/.test(handler));
assert.ok(/delete row\.passphrase/.test(handler));
assert.ok(/delete row\.signature/.test(handler));
assert.ok(/delete row\.token/.test(handler));
assert.ok(!/fire_s_activate_paid_subscription/.test(handler));
assert.ok(!/markPaid/.test(index));

assert.ok(!/cat\.markPaid/.test(client));
assert.ok(/Access updates when the server confirms/.test(client));
assert.ok(!/fire_s_apply_payfast_itn/.test(checkout), 'return_url checkout must not apply ITN');

console.log('payfast-itn-sql.test.js: ok');
