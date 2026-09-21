import assert from 'node:assert';
import crypto from 'node:crypto';
import { loadPayfastConfig, resolvePayfastMode, processUrlForMode, publicPayfastConfig } from '../supabase/functions/_shared/payfast-config.js';
import {
  assertSandboxCheckout,
  buildSignedCheckoutFields,
  generateSignature,
  payfastBuyerEmail,
  phpUrlEncode,
  resolveAuthoritativeCheckout,
  signatureParamString,
  amountForInterval
} from '../supabase/functions/_shared/payfast-sign.js';
import { md5hex } from '../supabase/functions/_shared/payfast-md5.js';

assert.strictEqual(resolvePayfastMode({}), 'sandbox');
assert.strictEqual(resolvePayfastMode({ PAYFAST_MODE: '' }), 'sandbox');
assert.strictEqual(resolvePayfastMode({ PAYFAST_MODE: 'sandbox' }), 'sandbox');
assert.strictEqual(processUrlForMode('sandbox'), 'https://sandbox.payfast.co.za/eng/process');
assert.strictEqual(processUrlForMode('live'), 'https://www.payfast.co.za/eng/process');

assert.throws(
  () => resolvePayfastMode({ PAYFAST_MODE: 'live' }),
  /PAYFAST_ALLOW_LIVE/
);
assert.strictEqual(
  resolvePayfastMode({ PAYFAST_MODE: 'live', PAYFAST_ALLOW_LIVE: 'true' }),
  'live'
);

const sandboxCfg = loadPayfastConfig({
  PAYFAST_MODE: 'sandbox',
  PAYFAST_SANDBOX_MERCHANT_ID: 'test-sandbox-id',
  PAYFAST_SANDBOX_MERCHANT_KEY: 'test-sandbox-key',
  PAYFAST_SANDBOX_PASSPHRASE: 'test-sandbox-pass',
  FIRE_S_PUBLIC_URL: 'https://georgevdx.github.io/fire-s-online-app/staging/',
  SUPABASE_URL: 'https://ejqgzpkfcwocmtvwufwp.supabase.co'
});
assert.strictEqual(sandboxCfg.mode, 'sandbox');
assert.strictEqual(sandboxCfg.processUrl, 'https://sandbox.payfast.co.za/eng/process');
assert.ok(sandboxCfg.returnUrl.indexOf('payfast=ok') !== -1);
assert.ok(sandboxCfg.cancelUrl.indexOf('payfast=cancel') !== -1);
assert.strictEqual(
  sandboxCfg.notifyUrl,
  'https://ejqgzpkfcwocmtvwufwp.supabase.co/functions/v1/payfast-itn'
);
assert.strictEqual(
  sandboxCfg.validateUrl,
  'https://sandbox.payfast.co.za/eng/query/validate'
);
assert.strictEqual(sandboxCfg.validateHost, 'sandbox.payfast.co.za');
assert.strictEqual(sandboxCfg.merchantKey, 'test-sandbox-key');
assert.ok(!Object.prototype.hasOwnProperty.call(publicPayfastConfig(sandboxCfg), 'passphrase'));
assert.ok(publicPayfastConfig(sandboxCfg).validateUrl.indexOf('/eng/query/validate') !== -1);

assert.throws(
  () =>
    loadPayfastConfig({
      PAYFAST_MODE: 'sandbox',
      PAYFAST_SANDBOX_MERCHANT_ID: 'x',
      PAYFAST_SANDBOX_MERCHANT_KEY: 'y',
      PAYFAST_SANDBOX_PASSPHRASE: 'z',
      PAYFAST_SANDBOX_PROCESS_URL: 'https://www.payfast.co.za/eng/process',
      SUPABASE_URL: 'https://example.supabase.co'
    }),
  /cannot use the live PayFast process URL/
);

const liveCfg = loadPayfastConfig({
  PAYFAST_MODE: 'live',
  PAYFAST_ALLOW_LIVE: 'true',
  PAYFAST_LIVE_MERCHANT_ID: 'live-id',
  PAYFAST_LIVE_MERCHANT_KEY: 'live-key',
  PAYFAST_LIVE_PASSPHRASE: 'live-pass',
  FIRE_S_PUBLIC_URL: 'https://georgevdx.github.io/fire-s-online-app/',
  SUPABASE_URL: 'https://ispsdmglyylcwkufphnv.supabase.co'
});
assert.strictEqual(liveCfg.mode, 'live');
assert.strictEqual(liveCfg.processUrl, 'https://www.payfast.co.za/eng/process');
assert.ok(liveCfg.returnUrl.indexOf('/fire-s-online-app/index.html') !== -1);

const pub = publicPayfastConfig(sandboxCfg);
assert.ok(!Object.prototype.hasOwnProperty.call(pub, 'passphrase'));
assert.ok(!Object.prototype.hasOwnProperty.call(pub, 'merchantKey'));
assert.strictEqual(pub.mode, 'sandbox');

assert.strictEqual(amountForInterval('monthly'), '250.00');
assert.strictEqual(amountForInterval('annual'), '2500.00');
assert.strictEqual(md5hex('hello'), '5d41402abc4b2a76b9719d911017c592');

const fields = buildSignedCheckoutFields(sandboxCfg, {
  kind: 'subscribe',
  interval: 'monthly',
  company: 'Acme Fire',
  companyId: 'company-uuid',
  email: 'owner@acme.test'
});
assert.strictEqual(fields.merchant_id, 'test-sandbox-id');
assert.strictEqual(fields.amount, '250.00');
assert.strictEqual(fields.recurring_amount, '250.00');
assert.strictEqual(fields.subscription_type, '1');
assert.strictEqual(fields.frequency, '3');
assert.strictEqual(fields.notify_url, sandboxCfg.notifyUrl);
assert.strictEqual(fields.custom_str1, 'company-uuid');
assert.strictEqual(fields.custom_str2, 'owner@acme.test');
assert.strictEqual(fields.email_address, 'fires-toets-buyer@example.com');
assert.notStrictEqual(fields.email_address, 'owner@acme.test');
assert.ok(fields.signature && fields.signature.length === 32);
assert.strictEqual(phpUrlEncode('~'), '%7E');
assert.strictEqual(phpUrlEncode('a b'), 'a+b');
assert.strictEqual(phpUrlEncode("!'()*"), '%21%27%28%29%2A');

const unsigned = Object.assign({}, fields);
delete unsigned.signature;
const param = signatureParamString(unsigned, sandboxCfg.passphrase);
const expected = crypto.createHash('md5').update(param, 'utf8').digest('hex');
assert.strictEqual(fields.signature, expected);
assert.strictEqual(generateSignature(unsigned, sandboxCfg.passphrase), expected);

const annual = buildSignedCheckoutFields(sandboxCfg, {
  kind: 'seat',
  interval: 'annual',
  email: 'owner@acme.test',
  seatEmail: 'inspector@acme.test',
  amount: '1.00'
});
assert.strictEqual(annual.amount, '2500.00');
assert.strictEqual(annual.frequency, '6');
assert.strictEqual(annual.custom_str5, 'inspector@acme.test');

const trusted = resolveAuthoritativeCheckout(
  { companyId: 'co-1', companyName: 'Acme', email: 'owner@acme.test' },
  { interval: 'monthly', amount: '1.00', price: 0, companyId: 'attacker', mPaymentId: 'evil', plan: 'enterprise' }
);
assert.strictEqual(trusted.planCode, 'standard');
assert.strictEqual(trusted.amount, '250.00');
assert.strictEqual(trusted.amountNumber, 250);
assert.strictEqual(trusted.companyId, 'co-1');
assert.ok(trusted.mPaymentId.indexOf('evil') === -1);

assert.strictEqual(payfastBuyerEmail(sandboxCfg, 'johandb@live.com'), 'fires-toets-buyer@example.com');
assert.strictEqual(payfastBuyerEmail(liveCfg, 'johandb@live.com'), 'johandb@live.com');
const liveFields = buildSignedCheckoutFields(liveCfg, {
  kind: 'subscribe',
  interval: 'monthly',
  company: 'Acme Fire',
  companyId: 'company-uuid',
  email: 'owner@acme.test'
});
assert.strictEqual(liveFields.email_address, 'owner@acme.test');

assertSandboxCheckout(sandboxCfg);
assert.throws(
  () => assertSandboxCheckout(liveCfg),
  /sandbox-only/
);

console.log('payfast-config.test.mjs: ok');
