// Sends Forgot password and scheduled-inspection mail.
// Requires function secrets RESEND_API_KEY and MAIL_FROM.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
// are provided to the function by Supabase.

const ALLOWED_ORIGINS = [
  'https://georgevdx.github.io',
  'http://127.0.0.1:8787',
  'http://localhost:8787'
];

const LIVE_REDIRECT = 'https://georgevdx.github.io/fire-s-online-app/';
const TOETS_REDIRECT = 'https://georgevdx.github.io/fire-s-online-app/staging/';

function corsHeaders(req) {
  const origin = String(req.headers.get('origin') || '');
  const allow = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  };
}

function json(body, status, req) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(req))
  });
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value).toLowerCase());
}

function safeRedirect(value) {
  const url = text(value);
  if (url === LIVE_REDIRECT || url === TOETS_REDIRECT) return url;
  return LIVE_REDIRECT;
}

function envReady() {
  return !!(text(Deno.env.get('RESEND_API_KEY')) && text(Deno.env.get('MAIL_FROM')));
}

async function sendResend(to, subject, message) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + text(Deno.env.get('RESEND_API_KEY')),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: text(Deno.env.get('MAIL_FROM')),
      to: [to],
      subject: subject,
      text: message
    })
  });
  if (!res.ok) {
    return { ok: false, reason: 'mail-rejected' };
  }
  return { ok: true };
}

async function recoveryLink(email, redirectTo) {
  const base = text(Deno.env.get('SUPABASE_URL')).replace(/\/$/, '');
  const key = text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  const res = await fetch(base + '/auth/v1/admin/generate_link', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      apikey: key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'recovery',
      email: email,
      redirect_to: safeRedirect(redirectTo)
    })
  });
  let body = {};
  try {
    body = await res.json();
  } catch (_) {}
  const link = text(
    body.action_link ||
      (body.properties && body.properties.action_link)
  );
  if (!res.ok || !link) return { ok: false, reason: 'no-login' };
  return { ok: true, link: link };
}

async function callerIsUser(req) {
  const header = text(req.headers.get('Authorization')).replace(/^Bearer\s+/i, '');
  const anon = text(Deno.env.get('SUPABASE_ANON_KEY'));
  const base = text(Deno.env.get('SUPABASE_URL')).replace(/\/$/, '');
  if (!header || !base || header === anon) return false;
  const res = await fetch(base + '/auth/v1/user', {
    headers: {
      Authorization: 'Bearer ' + header,
      apikey: anon || header
    }
  });
  return res.ok;
}

function assignmentText(fields) {
  const row = fields && typeof fields === 'object' ? fields : {};
  const lines = [
    'A Fire-S inspection is booked for you.',
    '',
    'Inspector: ' + text(row.inspector),
    'Company: ' + text(row.company),
    'Organisation: ' + text(row.organisation),
    'Premises: ' + text(row.premises),
    'Address: ' + text(row.address),
    'Visit date: ' + text(row.visit_date),
    'Inspection type: ' + text(row.inspection_type),
    'Occupancy: ' + text(row.occupancy),
    'Site contact: ' + text(row.site_contact),
    'Scheduled by: ' + text(row.scheduled_by),
    '',
    'Open Fire-S. Home shows this booking under Upcoming inspections when the date is within 30 days, and under Scheduled priority.'
  ];
  return lines.join('\n');
}

Deno.serve(async function (req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, reason: 'method' }, 405, req);
  }
  if (!envReady()) {
    return json({ ok: false, reason: 'mailer-not-configured' }, 503, req);
  }

  let payload = {};
  try {
    payload = await req.json();
  } catch (_) {
    return json({ ok: false, reason: 'bad-json' }, 400, req);
  }

  const kind = text(payload.kind);
  const email = text(payload.email).toLowerCase();
  if (!looksLikeEmail(email)) {
    return json({ ok: false, reason: 'no-email' }, 400, req);
  }

  if (kind === 'recovery') {
    const link = await recoveryLink(email, payload.redirectTo);
    if (!link.ok) return json({ ok: false, reason: 'no-login' }, 200, req);
    const sent = await sendResend(
      email,
      'Fire-S: choose a new password',
      [
        'A password reset was requested for this Fire-S login.',
        '',
        'Open this link and choose a new password:',
        link.link,
        '',
        'If you did not ask for this, ignore the email.'
      ].join('\n')
    );
    return json(sent.ok ? { ok: true } : { ok: false, reason: sent.reason }, sent.ok ? 200 : 502, req);
  }

  if (kind === 'assignment') {
    const allowed = await callerIsUser(req);
    if (!allowed) return json({ ok: false, reason: 'sign-in-required' }, 401, req);
    const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {};
    const subject = text(fields._subject) || 'Fire-S: inspection booked for you';
    const sent = await sendResend(email, subject.slice(0, 180), assignmentText(fields));
    return json(sent.ok ? { ok: true } : { ok: false, reason: sent.reason }, sent.ok ? 200 : 502, req);
  }

  return json({ ok: false, reason: 'kind' }, 400, req);
});
