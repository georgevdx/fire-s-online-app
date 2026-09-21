'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const sql = read('SUPABASE_payfast_sandbox_buyer.sql');
const client = read('staging/fire-s-payfast.js');
const sign = read('supabase/functions/_shared/payfast-sign.js');

assert.ok(/create table if not exists public\.fire_s_payfast_sandbox_secrets/.test(sql));
assert.ok(/revoke all on table public\.fire_s_payfast_sandbox_secrets from authenticated/.test(sql));
assert.ok(/function public\.fire_s_sandbox_payfast_html/.test(sql));
assert.ok(/fires-toets-buyer@example\.com/.test(sql));
assert.ok(/fire_s_begin_payfast_checkout/.test(sql));
assert.ok(/Do not run on live/.test(sql));
assert.ok(/Salt Passphrase/.test(sql));
assert.ok(/function public\.fire_s_payfast_clean_secret/.test(sql));
assert.ok(/v_b in \(45, 46, 95\)/.test(sql), 'PHP urlencode must not treat tilde as unreserved');
assert.ok(!/v_b in \(45, 46, 95, 126\)/.test(sql));
assert.ok(/name_first', 'name_last', 'email_address'/.test(sql));
assert.ok(/subscription_type', 'billing_date', 'recurring_amount', 'frequency', 'cycles'/.test(sql));
assert.ok(/'0'/.test(sql) && /cycles/.test(sql));
assert.ok(/md5\(v_sig_src\)/.test(sql));
assert.ok(/fire_s_payfast_clean_secret\(s\.merchant_id\)/.test(sql));
assert.ok(/fire_s_payfast_clean_secret\(s\.passphrase\)/.test(sql));
assert.ok(!/grant .* fire_s_payfast_sandbox_secrets .* authenticated/.test(sql));
assert.ok(/function sandboxSignedHtml\(/.test(client));
assert.ok(/fire_s_sandbox_payfast_html/.test(client));
assert.ok(/\?v=205/.test(client));
assert.ok(/Salt Passphrase/.test(client));
assert.ok(sign.indexOf("[!'()*~]") !== -1, 'JS phpUrlEncode must encode tilde like PHP');

function sqlPhpEncode(value) {
  const src = String(value == null ? '' : value).trim();
  if (!src) return '';
  const bytes = Buffer.from(src, 'utf8');
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if ((b >= 48 && b <= 57) || (b >= 65 && b <= 90) || (b >= 97 && b <= 122) || b === 45 || b === 46 || b === 95) {
      out += String.fromCharCode(b);
    } else if (b === 32) {
      out += '+';
    } else {
      out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return out;
}

function jsPhpEncode(value) {
  return encodeURIComponent(String(value == null ? '' : value).trim())
    .replace(/[!'()*~]/g, function (ch) {
      return '%' + ch.charCodeAt(0).toString(16).toUpperCase();
    })
    .replace(/%20/g, '+')
    .replace(/%[0-9a-f]{2}/gi, function (hex) {
      return hex.toUpperCase();
    });
}

const samples = [
  'Fire-S monthly login',
  'https://georgevdx.github.io/fire-s-online-app/staging/index.html?payfast=ok',
  'fires-toets-buyer@example.com',
  'Owner login owner@acme.test',
  'a b~c!*()',
  'payfast',
  '250.00',
  'true',
  '0'
];
samples.forEach(function (sample) {
  assert.strictEqual(sqlPhpEncode(sample), jsPhpEncode(sample), sample);
});
assert.strictEqual(sqlPhpEncode('~'), '%7E');
assert.strictEqual(jsPhpEncode('~'), '%7E');
assert.strictEqual(sqlPhpEncode('a b'), 'a+b');
assert.strictEqual(
  sqlPhpEncode('http://x.co.za/a?b=c'),
  'http%3A%2F%2Fx.co.za%2Fa%3Fb%3Dc'
);

const param =
  'merchant_id=10004002&merchant_key=q1cd2rdny4a53&amount=10.00&item_name=Test&passphrase=payfast';
assert.strictEqual(crypto.createHash('md5').update(param, 'utf8').digest('hex').length, 32);

console.log('payfast-sandbox-buyer.test.js: ok');
