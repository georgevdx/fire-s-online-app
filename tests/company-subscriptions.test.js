'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('SUPABASE_company_subscriptions.sql');
const migration = read('supabase/migrations/20260916140000_fire_s_company_subscriptions.sql');

assert.strictEqual(sql, migration, 'SQL Editor copy must match the migration');
assert.ok(/create table if not exists public.fire_s_company_subscriptions/.test(sql));
assert.ok(/create table if not exists public.fire_s_payment_events/.test(sql));
assert.ok(/fire_s_record_payment_event/.test(sql));
assert.ok(/fire_s_map_internal_subscription_status/.test(sql));
assert.ok(/Backfill existing companies/.test(sql));
assert.ok(/grandfather/.test(sql));
assert.ok(!/delete from public\.inspections/.test(sql));
assert.ok(!/drop table if exists public\.inspections/.test(sql));
assert.ok(/grant execute on function public\.fire_s_record_payment_event[\s\S]*to service_role/.test(sql));
assert.ok(/notify pgrst/.test(sql));

console.log('company-subscriptions.test.js: ok');
