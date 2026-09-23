'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const check = read('SUPABASE_live_step6_check.sql');
const hotfix = read('SUPABASE_live_fix_trial_ends_at.sql');
const prepare = read('SUPABASE_live_payfast_prepare.sql');
const openCompany = read('SUPABASE_payfast_open_company.sql');
const resubscribe = read('SUPABASE_payfast_resubscribe.sql');
const checkout = read('SUPABASE_payfast_checkout.sql');
const lifecycle = read('SUPABASE_subscription_lifecycle.sql');

assert.ok(/ispsdmglyylcwkufphnv/.test(check), 'check must name the live project');
assert.ok(/inspection_rows/.test(check));
assert.ok(/has_begin_checkout/.test(check));
assert.ok(/has_apply_itn/.test(check));
assert.ok(!/insert into/i.test(check));
assert.ok(!/update /i.test(check));
assert.ok(!/delete from/i.test(check));

assert.ok(/Do not run SUPABASE_payfast_resubscribe/.test(prepare));
assert.ok(/Do not run SUPABASE_payfast_open_company/.test(prepare) || /payfast_open_company/.test(prepare));
assert.ok(/fire_s_prepare_payfast_company/.test(prepare));
assert.ok(/fire_s_payfast_checkout_intent/.test(prepare));
assert.ok(/most inspections/.test(prepare) || /holds inspections/.test(prepare));
assert.ok(!/when 'manager' then 0/.test(prepare));
assert.ok(/Do not insert company_members here/.test(prepare));
assert.ok(!/delete from public\.inspections/.test(prepare));
assert.ok(/count\(\*\)::int/.test(prepare), 'live my_company must rank by inspection count');

assert.ok(/Do not run on live/.test(openCompany));
assert.ok(/Do not run on live/.test(resubscribe));
assert.ok(/fire_s_begin_payfast_checkout/.test(checkout));
assert.ok(/fire_s_apply_payfast_itn/.test(lifecycle));

assert.ok(/add column if not exists trial_ends_at/.test(hotfix));
assert.ok(/fire_s_compute_entitlement/.test(hotfix));
assert.ok(!/delete from public\.inspections/.test(hotfix));

console.log('live-sql-step6.test.js: ok');
