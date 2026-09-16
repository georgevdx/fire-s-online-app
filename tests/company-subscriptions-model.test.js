'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const migrationPath = 'supabase/migrations/20260916140000_fire_s_company_subscriptions.sql';
const editorPath = 'SUPABASE_company_subscriptions.sql';
const sql = read(migrationPath);
const editor = read(editorPath);
const entitlement = read('SUPABASE_company_entitlement.sql');

assert.strictEqual(sql, editor, 'SQL Editor copy must match the migration file');

assert.ok(/create table if not exists public\.fire_s_company_subscriptions/.test(sql));
assert.ok(/create table if not exists public\.fire_s_payment_events/.test(sql));

[
  'company_id',
  'provider',
  'plan_code',
  'billing_interval',
  'status',
  'trial_started_at',
  'trial_ends_at',
  'subscription_started_at',
  'current_period_start',
  'current_period_end',
  'cancelled_at',
  'payfast_subscription_token',
  'payfast_payment_id',
  'last_payment_at',
  'next_billing_at',
  'created_at',
  'updated_at'
].forEach(function (col) {
  assert.ok(sql.indexOf(col) !== -1, 'subscription table must include ' + col);
});

['trialing', 'active', 'past_due', 'cancelled', 'expired', 'payment_pending'].forEach(function (status) {
  assert.ok(sql.indexOf("'" + status + "'") !== -1, 'status check must include ' + status);
});

assert.ok(/unique \(company_id\)/.test(sql) || /fire_s_company_subscriptions_company_uidx unique \(company_id\)/.test(sql));
assert.ok(/references public\.companies \(id\) on delete cascade/.test(sql));
assert.ok(/references public\.fire_s_company_subscriptions \(id\) on delete set null/.test(sql));

assert.ok(/payfast_payment_id/.test(sql));
assert.ok(/m_payment_id/.test(sql));
assert.ok(/amount numeric\(12, 2\)/.test(sql));
assert.ok(/payment_status/.test(sql));
assert.ok(/occurred_at/.test(sql));
assert.ok(/processed_at/.test(sql));
assert.ok(/subscription_id/.test(sql));
assert.ok(/fire_s_payment_events_duplicate_uidx/.test(sql));
assert.ok(/provider, payfast_payment_id, payment_status/.test(sql));

assert.ok(!/card_number text/.test(sql));
assert.ok(!/cvv text/.test(sql));
assert.ok(/- 'card_number'/.test(sql) && /- 'cvv'/.test(sql) && /- 'passphrase'/.test(sql));
assert.ok(/fire_s_sanitize_payment_payload/.test(sql));

assert.ok(/enable row level security/.test(sql));
assert.ok(/fire_s_company_subscriptions_select/.test(sql));
assert.ok(/fire_s_is_company_member\(company_id\)/.test(sql));
assert.ok(/fire_s_is_super_admin\(\)/.test(sql));
assert.ok(/fire_s_can_manage_company\(company_id\)/.test(sql), 'inspectors must not read payment events');

assert.ok(/fire_s_company_subscriptions_insert[\s\S]*with check \(false\)/.test(sql));
assert.ok(/fire_s_company_subscriptions_update[\s\S]*using \(false\)/.test(sql));
assert.ok(/fire_s_company_subscriptions_delete[\s\S]*using \(false\)/.test(sql));
assert.ok(/fire_s_payment_events_insert[\s\S]*with check \(false\)/.test(sql));
assert.ok(/fire_s_payment_events_update[\s\S]*using \(false\)/.test(sql));
assert.ok(/fire_s_payment_events_delete[\s\S]*using \(false\)/.test(sql));

assert.ok(/revoke insert, update, delete on table public\.fire_s_company_subscriptions from authenticated/.test(sql));
assert.ok(/revoke insert, update, delete on table public\.fire_s_payment_events from authenticated/.test(sql));
assert.ok(/grant select on table public\.fire_s_company_subscriptions to authenticated/.test(sql));
assert.ok(/grant all on table public\.fire_s_company_subscriptions to service_role/.test(sql));
assert.ok(/grant all on table public\.fire_s_payment_events to service_role/.test(sql));

assert.ok(/revoke all on function public\.fire_s_record_payment_event/.test(sql));
assert.ok(/grant execute on function public\.fire_s_record_payment_event\([^)]+\) to service_role/.test(sql));
assert.ok(
  !/grant execute on function public\.fire_s_record_payment_event\([^)]+\) to authenticated/.test(sql),
  'clients must not record payments'
);
assert.ok(/revoke all on function public\.fire_s_record_payment_event\([^)]+\) from authenticated/.test(sql));
assert.ok(/grant execute on function public\.fire_s_get_company_subscription\(uuid\) to authenticated/.test(sql));

assert.ok(/fire_s_protect_company_subscription/.test(sql));
assert.ok(/Only the billing service can create a subscription row/.test(sql));
assert.ok(/fire_s_entitlement_write_enabled/.test(sql));
assert.ok(/FIRE_S_SUBSCRIPTION:forbidden/.test(sql));

assert.ok(/fire_s_sync_subscription_from_company/.test(sql));
assert.ok(/fire_s_companies_after_sync_subscription/.test(sql));
assert.ok(/on conflict \(company_id\) do nothing/.test(sql), 'backfill must preserve existing subscription rows');
assert.ok(/Does not drop companies, inspections/.test(sql));
assert.ok(/Does not change fire_s_compute_entitlement/.test(sql));

assert.ok(/create or replace function public\.fire_s_compute_entitlement/.test(entitlement));
assert.ok(
  !/drop function if exists public\.fire_s_compute_entitlement/.test(sql),
  'Phase 2 must not drop the existing entitlement function'
);
assert.ok(!/drop table if exists public\.inspections/.test(sql));
assert.ok(!/delete from public\.inspections/.test(sql));

assert.ok(/notify pgrst/i.test(sql));
assert.ok(/fire_s_map_internal_subscription_status/.test(sql));

const liveHtml = read('index.html');
const stagingHtml = read('staging/index.html');
assert.ok(/id="projectFormSection"/.test(liveHtml) && /id="projectFormSection"/.test(stagingHtml));

console.log('company-subscriptions-model.test.js: ok');
