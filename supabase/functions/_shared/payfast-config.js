/**
 * PayFast server configuration.
 * Secrets stay in the function environment (Supabase secrets / .env).
 * Never import this module from the PWA bundle.
 */

const SANDBOX_PROCESS = 'https://sandbox.payfast.co.za/eng/process';
const LIVE_PROCESS = 'https://www.payfast.co.za/eng/process';
const SANDBOX_VALIDATE = 'https://sandbox.payfast.co.za/eng/query/validate';
const LIVE_VALIDATE = 'https://www.payfast.co.za/eng/query/validate';

/** Hosts PayFast documents for ITN origin checks. */
export const PAYFAST_VALID_HOSTS = [
  'www.payfast.co.za',
  'sandbox.payfast.co.za',
  'w1w.payfast.co.za',
  'w2w.payfast.co.za'
];
const DEFAULT_SANDBOX_PUBLIC =
  'https://georgevdx.github.io/fire-s-online-app/staging/index.html';
const DEFAULT_LIVE_PUBLIC =
  'https://georgevdx.github.io/fire-s-online-app/index.html';

export function text(value) {
  return String(value == null ? '' : value).trim();
}

function envGet(env, key) {
  if (!env) return '';
  if (typeof env.get === 'function') return text(env.get(key));
  return text(env[key]);
}

export function resolvePayfastMode(env) {
  const requested = text(envGet(env, 'PAYFAST_MODE') || 'sandbox').toLowerCase();
  if (requested !== 'live') return 'sandbox';
  const allow = text(envGet(env, 'PAYFAST_ALLOW_LIVE')).toLowerCase();
  if (allow !== 'true') {
    throw new Error(
      'PAYFAST_MODE=live is blocked. Development and toets must stay on sandbox. Set PAYFAST_ALLOW_LIVE=true only on the live Supabase project.'
    );
  }
  return 'live';
}

export function defaultPublicUrl(mode) {
  return mode === 'live' ? DEFAULT_LIVE_PUBLIC : DEFAULT_SANDBOX_PUBLIC;
}

export function processUrlForMode(mode) {
  return mode === 'live' ? LIVE_PROCESS : SANDBOX_PROCESS;
}

export function validateUrlForMode(mode) {
  return mode === 'live' ? LIVE_VALIDATE : SANDBOX_VALIDATE;
}

export function validateHostForMode(mode) {
  return mode === 'live' ? 'www.payfast.co.za' : 'sandbox.payfast.co.za';
}

function withIndexHtml(url) {
  const raw = text(url);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    let path = parsed.pathname || '/';
    if (path.endsWith('/')) path += 'index.html';
    else if (!/\.html?$/i.test(path)) path = path.replace(/\/?$/, '/') + 'index.html';
    parsed.pathname = path;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch (_) {
    if (/\.html?$/i.test(raw)) return raw.split('?')[0];
    return raw.replace(/\/?$/, '/') + 'index.html';
  }
}

function withPayfastQuery(appIndexUrl, status) {
  const base = withIndexHtml(appIndexUrl);
  const join = base.indexOf('?') === -1 ? '?' : '&';
  return base + join + 'payfast=' + encodeURIComponent(status);
}

function prefixForMode(mode) {
  return mode === 'live' ? 'PAYFAST_LIVE_' : 'PAYFAST_SANDBOX_';
}

export function merchantSecretNames(mode) {
  const prefix = prefixForMode(mode === 'live' ? 'live' : 'sandbox');
  return {
    merchantId: prefix + 'MERCHANT_ID',
    merchantKey: prefix + 'MERCHANT_KEY',
    passphrase: prefix + 'PASSPHRASE'
  };
}

function merchantValue(env, modeName) {
  return (
    envGet(env, merchantSecretNames(modeName).merchantId) ||
    envGet(env, 'PAYFAST_MERCHANT_ID')
  );
}

function merchantKeyValue(env, modeName) {
  return (
    envGet(env, merchantSecretNames(modeName).merchantKey) ||
    envGet(env, 'PAYFAST_MERCHANT_KEY')
  );
}

function passphraseValue(env, modeName) {
  return (
    envGet(env, merchantSecretNames(modeName).passphrase) ||
    envGet(env, 'PAYFAST_PASSPHRASE')
  );
}

/** Secret names only — never values. Empty when mode itself is blocked. */
export function missingMerchantSecretNames(env) {
  let mode = 'sandbox';
  try {
    mode = resolvePayfastMode(env);
  } catch (_) {
    return [];
  }
  const names = merchantSecretNames(mode);
  const missing = [];
  if (!merchantValue(env, mode)) missing.push(names.merchantId);
  if (!merchantKeyValue(env, mode)) missing.push(names.merchantKey);
  if (!passphraseValue(env, mode)) missing.push(names.passphrase);
  return missing;
}

/**
 * User-facing checkout errors. Never echo secret values.
 * Keep the word "passphrase" in missing-name messages so the owner can
 * match the dashboard secret name.
 */
export function safePayfastErrorMessage(err) {
  const message = String((err && err.message) || 'PayFast is not ready.');
  if (/service_role|SUPABASE_SERVICE_ROLE/i.test(message)) {
    return 'PayFast is not configured on the server.';
  }
  if (/=[A-Za-z0-9+/=_-]{12,}/.test(message) && /merchant|passphrase|secret/i.test(message)) {
    return 'PayFast is not configured on the server.';
  }
  return message;
}

export function loadPayfastConfig(env) {
  const mode = resolvePayfastMode(env);
  const prefix = prefixForMode(mode);

  const merchantId = merchantValue(env, mode);
  const merchantKey = merchantKeyValue(env, mode);
  const passphrase = passphraseValue(env, mode);

  const processUrlOverride = envGet(env, prefix + 'PROCESS_URL');
  const processUrl = processUrlOverride || processUrlForMode(mode);
  if (mode === 'sandbox' && /www\.payfast\.co\.za/i.test(processUrl)) {
    throw new Error('Sandbox mode cannot use the live PayFast process URL.');
  }
  if (mode === 'live' && /sandbox\.payfast\.co\.za/i.test(processUrl)) {
    throw new Error('Live mode cannot use the sandbox PayFast process URL.');
  }

  const validateUrlOverride = envGet(env, prefix + 'VALIDATE_URL');
  const validateUrl = validateUrlOverride || validateUrlForMode(mode);
  if (mode === 'sandbox' && /www\.payfast\.co\.za/i.test(validateUrl)) {
    throw new Error('Sandbox mode cannot use the live PayFast validate URL.');
  }
  if (mode === 'live' && /sandbox\.payfast\.co\.za/i.test(validateUrl)) {
    throw new Error('Live mode cannot use the sandbox PayFast validate URL.');
  }
  if (!/\/eng\/query\/validate\/?$/i.test(validateUrl)) {
    throw new Error('PayFast validate URL must be the /eng/query/validate endpoint.');
  }

  const publicUrl =
    withIndexHtml(envGet(env, 'FIRE_S_PUBLIC_URL')) || defaultPublicUrl(mode);
  const returnUrl =
    envGet(env, 'PAYFAST_RETURN_URL') || withPayfastQuery(publicUrl, 'ok');
  const cancelUrl =
    envGet(env, 'PAYFAST_CANCEL_URL') || withPayfastQuery(publicUrl, 'cancel');

  const supabaseUrl = envGet(env, 'SUPABASE_URL').replace(/\/$/, '');
  const notifyUrl =
    envGet(env, 'PAYFAST_NOTIFY_URL') ||
    (supabaseUrl ? supabaseUrl + '/functions/v1/payfast-itn' : '');

  const missing = missingMerchantSecretNames(env);
  if (missing.length) {
    const source =
      mode === 'live'
        ? 'www.payfast.co.za Settings → Developer Settings into those names on the live Supabase project (ispsdmglyylcwkufphnv)'
        : 'sandbox.payfast.co.za Settings → Developer Settings into those names on Fire-S Test';
    const err = new Error(
      'PayFast ' +
        mode +
        ' is missing server secrets: ' +
        missing.join(', ') +
        '. Paste Merchant ID, Merchant Key and Security Passphrase from ' +
        source +
        '. Do not leave the Update box empty before Save.'
    );
    err.missingSecrets = missing;
    throw err;
  }
  if (!notifyUrl) {
    throw new Error('PAYFAST_NOTIFY_URL or SUPABASE_URL is required for ITN.');
  }

  return {
    mode,
    sandbox: mode === 'sandbox',
    merchantId,
    merchantKey,
    passphrase,
    sandboxBuyerEmail: mode === 'sandbox' ? envGet(env, 'PAYFAST_SANDBOX_BUYER_EMAIL') : '',
    publicUrl,
    returnUrl,
    cancelUrl,
    notifyUrl,
    processUrl,
    validateUrl,
    validateHost: validateHostForMode(mode),
    supabaseUrl
  };
}

/** Public snapshot for logs / health. Never includes secrets. */
export function publicPayfastConfig(cfg) {
  if (!cfg || cfg.configured === false || !cfg.merchantId) {
    return {
      mode: (cfg && cfg.mode) || 'sandbox',
      configured: false,
      merchantIdConfigured: false
    };
  }
  return {
    mode: cfg.mode,
    sandbox: cfg.sandbox === true,
    processUrl: cfg.processUrl,
    publicUrl: cfg.publicUrl,
    returnUrl: cfg.returnUrl,
    cancelUrl: cfg.cancelUrl,
    notifyUrl: cfg.notifyUrl,
    validateUrl: cfg.validateUrl,
    merchantIdConfigured: !!text(cfg.merchantId),
    configured: true
  };
}
