'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { md5hex } = require('../supabase/functions/_shared/payfast-md5.js');
const {
  assertCheckoutMode,
  assertLiveCheckout,
  assertSandboxCheckout,
  itnParamString,
  parseItnFields,
  phpUrlEncode,
  verifyItnSignature
} = require('../supabase/functions/_shared/payfast-sign.js');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

const liveHtml = read('index.html');
const liveEnv = read('fire-s-env.js');
const livePayfast = read('fire-s-payfast.js');
const checkout = read('supabase/functions/payfast-checkout/index.js');
const itn = read('supabase/functions/payfast-itn/index.js');
const configToml = read('supabase/config.toml');
const stagingHtml = read('staging/index.html');
const stagingEnv = read('staging/fire-s-env.js');

assert.ok(/fire-s-payfast\.js/.test(liveHtml), 'Live must load PayFast');
assert.ok(/id="fireSPayfastPayBtn"/.test(liveHtml), 'Live Subscription must have Pay on PayFast');
assert.ok(/id="fireSSubscriptionRequiredSection"/.test(liveHtml));
assert.ok(!/PayFast sandbox/.test(liveHtml), 'Live copy must not say sandbox');
assert.ok(!/No card is taken yet/.test(liveHtml));
assert.ok(/class="fire-s-booting fire-s-entitlement-blocked"/.test(liveHtml));
assert.ok(/id="fireSCompanyBillingPanel"/.test(liveHtml));
assert.ok(/fire-s-subscriptions\.js\?v=1-17-live/.test(liveHtml));
assert.ok(/fire-s-subscribe\.js\?v=1-36-cancel/.test(liveHtml));
assert.ok(/fire-s-payfast\.js\?v=1-14-live/.test(liveHtml));
assert.ok(/fire-s-entitlement\.js\?v=1-3-107-lock/.test(liveHtml));
assert.ok(/service-worker\.js\?v=108-76-live-cancel/.test(liveHtml));
assert.ok(/pay on PayFast/.test(read('fire-s-user-manual.js')));
assert.ok(/pays on PayFast/.test(read('terms.html')));
assert.ok(!/The app does not take a card yet/.test(read('terms.html')));
assert.ok(/pays on PayFast/.test(read('privacy.html')));
assert.ok(/pays on PayFast/.test(read('fire-s-subscribe-notify.js')));
assert.ok(/1-8-payfast/.test(liveHtml));
assert.ok(/1-40-payfast/.test(liveHtml));

const fetchBody = livePayfast.match(/body:\s*JSON\.stringify\(\{[\s\S]*?\}\)/);
assert.ok(fetchBody, 'Live PayFast POST body must exist');
assert.ok(!/amount/.test(fetchBody[0]), 'Browser must not send a price');
assert.ok(!/companyId/.test(fetchBody[0]), 'Browser must not send company_id as authority');
assert.ok(!/mPaymentId/.test(fetchBody[0]), 'Browser must not send the payment reference');
assert.ok(/mode\)\.toLowerCase\(\) !== 'live'/.test(livePayfast), 'Sandbox SQL fallback must not run on live');
assert.ok(/mode: staging \? 'sandbox' : 'live'/.test(liveEnv) || /mode: staging \? 'sandbox' : 'live'/.test(liveEnv.replace(/\s+/g, ' ')));
assert.ok(/appVersion: staging \? '1\.3\.27-toets' : '1\.3\.66'/.test(liveEnv));
assert.ok(/Version 1\.3\.66/.test(liveHtml));
assert.ok(/e\.isStaging\) return mode !== 'live'/.test(livePayfast) || /isStaging\) return mode !== 'live'/.test(livePayfast));
assert.ok(/www\.payfast\.co\.za/.test(livePayfast));
assert.ok(!/merchant_key/.test(livePayfast));
assert.ok(!/passphrase\s*:/.test(liveEnv));

assert.ok(/assertCheckoutMode/.test(checkout));
assert.ok(!/assertSandboxCheckout\(cfg\)/.test(checkout));
assert.ok(/mode: cfg\.mode/.test(checkout));

assert.ok(/verify_jwt = false/.test(configToml));
assert.ok(/\[functions\.payfast-itn\]/.test(configToml));
assert.ok(/fire_s_apply_payfast_itn/.test(itn));
assert.ok(/verifyItnSignature/.test(itn));
assert.ok(/eng\/query\/validate/.test(itn) || /validateWithPayfast/.test(itn));
assert.ok(!/VITE_PAYFAST/.test(itn));

assert.ok(/PayFast sandbox/.test(stagingHtml), 'Toets must stay sandbox');
assert.ok(/mode: 'sandbox'/.test(stagingEnv));
assert.ok(/1\.3\.114-toets/.test(stagingEnv));

const sandboxCfg = { mode: 'sandbox', processUrl: 'https://sandbox.payfast.co.za/eng/process' };
const liveCfg = { mode: 'live', processUrl: 'https://www.payfast.co.za/eng/process' };
assertCheckoutMode(sandboxCfg);
assertCheckoutMode(liveCfg);
assert.throws(() => assertSandboxCheckout(liveCfg), /sandbox-only/);
assert.throws(() => assertLiveCheckout(sandboxCfg), /PAYFAST_MODE=live/);

const params = new URLSearchParams(
  'merchant_id=100001&payment_status=COMPLETE&pf_payment_id=pf-99&m_payment_id=fs-sub-1&amount_gross=250.00&custom_str1=11111111-1111-1111-1111-111111111111&custom_str3=monthly&custom_str4=subscribe'
);
const passphrase = 'test-live-pass';
const unsigned = itnParamString(params, passphrase);
const signature = crypto.createHash('md5').update(unsigned, 'utf8').digest('hex');
assert.strictEqual(md5hex(unsigned), signature);
assert.ok(verifyItnSignature(params, passphrase, signature));
assert.ok(!verifyItnSignature(params, passphrase, 'deadbeef'));
const fields = parseItnFields(params);
assert.strictEqual(fields.payfastPaymentId, 'pf-99');
assert.strictEqual(fields.amount, 250);
assert.strictEqual(fields.planCode, 'standard');
assert.strictEqual(fields.billingInterval, 'monthly');
assert.ok(fields.companyId);
assert.strictEqual(phpUrlEncode('a b'), 'a+b');

console.log('payfast-live.test.js: ok');
