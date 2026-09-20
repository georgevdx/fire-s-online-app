'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('SUPABASE_payfast_sandbox_buyer.sql');
const client = read('staging/fire-s-payfast.js');

assert.ok(/create table if not exists public\.fire_s_payfast_sandbox_secrets/.test(sql));
assert.ok(/revoke all on table public\.fire_s_payfast_sandbox_secrets from authenticated/.test(sql));
assert.ok(/function public\.fire_s_sandbox_payfast_html/.test(sql));
assert.ok(/fires-toets-buyer@example\.com/.test(sql));
assert.ok(/fire_s_begin_payfast_checkout/.test(sql));
assert.ok(/Do not run on live/.test(sql));
assert.ok(!/grant .* fire_s_payfast_sandbox_secrets .* authenticated/.test(sql));
assert.ok(/function sandboxSignedHtml\(/.test(client));
assert.ok(/fire_s_sandbox_payfast_html/.test(client));
assert.ok(/get_byte/.test(sql));
assert.ok(/md5\(v_sig_src\)/.test(sql));

console.log('payfast-sandbox-buyer.test.js: ok');
