/**
 * PayFast server configuration.
 * Secrets stay in the function environment (Supabase secrets / .env).
 * Never import this module from the PWA bundle.
 */

const SANDBOX_PROCESS = 'https://sandbox.payfast.co.za/eng/process';
const LIVE_PROCESS = 'https://www.payfast.co.za/eng/process';
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

export function loadPayfastConfig(env) {
  const mode = resolvePayfastMode(env);
  const prefix = prefixForMode(mode);

  const merchantId =
    envGet(env, prefix + 'MERCHANT_ID') || envGet(env, 'PAYFAST_MERCHANT_ID');
  const merchantKey =
    envGet(env, prefix + 'MERCHANT_KEY') || envGet(env, 'PAYFAST_MERCHANT_KEY');
  const passphrase =
    envGet(env, prefix + 'PASSPHRASE') || envGet(env, 'PAYFAST_PASSPHRASE');

  const processUrlOverride = envGet(env, prefix + 'PROCESS_URL');
  const processUrl = processUrlOverride || processUrlForMode(mode);
  if (mode === 'sandbox' && /www\.payfast\.co\.za/i.test(processUrl)) {
    throw new Error('Sandbox mode cannot use the live PayFast process URL.');
  }
  if (mode === 'live' && /sandbox\.payfast\.co\.za/i.test(processUrl)) {
    throw new Error('Live mode cannot use the sandbox PayFast process URL.');
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

  if (!merchantId || !merchantKey || !passphrase) {
    throw new Error(
      'PayFast ' +
        mode +
        ' merchant id, merchant key and passphrase must be set in server secrets.'
    );
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
    publicUrl,
    returnUrl,
    cancelUrl,
    notifyUrl,
    processUrl,
    supabaseUrl
  };
}

/** Public snapshot for logs / health. Never includes secrets. */
export function publicPayfastConfig(cfg) {
  if (!cfg) return { mode: 'sandbox', configured: false };
  return {
    mode: cfg.mode,
    sandbox: cfg.sandbox === true,
    processUrl: cfg.processUrl,
    publicUrl: cfg.publicUrl,
    returnUrl: cfg.returnUrl,
    cancelUrl: cfg.cancelUrl,
    notifyUrl: cfg.notifyUrl,
    merchantIdConfigured: !!text(cfg.merchantId),
    configured: true
  };
}
