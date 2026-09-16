'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function walk(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    if (entry.name === 'node_modules' || entry.name === '.git') return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
      return;
    }
    acc.push(full);
  });
  return acc;
}

const root = path.join(__dirname, '..');
const files = walk(root, []);

const clientLike = files.filter(function (file) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (rel.indexOf('supabase/functions/') === 0) return false;
  if (rel === '.env.example') return false;
  if (/\.sql$/i.test(rel)) return false;
  if (/^tests\//.test(rel)) return false;
  return /\.(js|html|css|json|md)$/i.test(rel);
});

const forbidden = [
  /VITE_PAYFAST/i,
  /NEXT_PUBLIC_PAYFAST/i,
  /REACT_APP_PAYFAST/i,
  /jt7NOE43FZPn/,
  /46f0cd694581a/,
  /merchantKey\s*:/,
  /passphrase\s*:/
];

clientLike.forEach(function (file) {
  const src = fs.readFileSync(file, 'utf8');
  forbidden.forEach(function (re) {
    assert.ok(!re.test(src), path.relative(root, file) + ' must not contain ' + re);
  });
});

const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
assert.ok(/PAYFAST_MODE=sandbox/.test(envExample));
assert.ok(/PAYFAST_ALLOW_LIVE=false/.test(envExample));
assert.ok(/PAYFAST_SANDBOX_MERCHANT_KEY=/.test(envExample));
assert.ok(/PAYFAST_NOTIFY_URL=/.test(envExample));
assert.ok(/NEVER prefix these with VITE_/.test(envExample));
assert.ok(!/jt7NOE43FZPn/.test(envExample));
assert.ok(!/46f0cd694581a/.test(envExample));
assert.ok(!/^PAYFAST_SANDBOX_MERCHANT_KEY=.+$/m.test(envExample.split('\n').filter(function (line) {
  return line.indexOf('PAYFAST_SANDBOX_MERCHANT_KEY=') === 0;
})[0].replace('PAYFAST_SANDBOX_MERCHANT_KEY=', '')));

const stagingEnv = fs.readFileSync(path.join(root, 'staging/fire-s-env.js'), 'utf8');
assert.ok(/mode: 'sandbox'/.test(stagingEnv));
assert.ok(/checkoutFunction: 'payfast-checkout'/.test(stagingEnv));

const liveEnv = fs.readFileSync(path.join(root, 'fire-s-env.js'), 'utf8');
assert.ok(!/passphrase/.test(liveEnv));
assert.ok(!/merchantKey/.test(liveEnv));

const checkout = fs.readFileSync(
  path.join(root, 'supabase/functions/payfast-checkout/index.js'),
  'utf8'
);
assert.ok(/loadPayfastConfig/.test(checkout));
assert.ok(/buildSignedCheckoutFields/.test(checkout));
assert.ok(/text\/html/.test(checkout));

console.log('payfast-secrets-not-in-client.test.js: ok');
