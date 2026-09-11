// The studio's one server-side surface.
//
// Everything the fan makes is still composited in their browser — this handles
// exactly one thing the browser cannot: writing an email to a list they asked
// to be on. Every other request falls through to the static assets.
//
// Hard rule, enforced below rather than promised: no request body over
// MAX_BODY bytes and nothing but a small JSON object is ever read. There is no
// code path here that accepts an image, and the cap is small enough that one
// could not arrive by accident.

const MAX_BODY = 2048;          // bytes; a signup is ~200
const WINDOW_MS = 10 * 60_000;  // throttle window
const MAX_PER_WINDOW = 8;       // signups per IP per window

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    // Same-origin app, so no CORS is granted to anyone else.
    'x-content-type-options': 'nosniff',
  },
});

// Deliberately permissive on shape and strict on size: fans mistype, and a
// regex that rejects a valid address is worse than one that accepts a dud.
function cleanEmail(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s.length < 6 || s.length > 254) return null;
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

const cleanShort = (raw, max) => {
  const s = String(raw ?? '').trim().slice(0, max);
  return s.length ? s : null;
};

async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Returns true when this caller has spent its allowance. Prunes expired rows
// on the way through so the table never needs a sweeper.
async function throttled(env, request) {
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const salt = env.THROTTLE_SALT || 'texans-wallpaper-studio';
  const key = await hashIp(ip, salt);
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  await env.DB.prepare('DELETE FROM throttle WHERE window_start < ?').bind(cutoff).run();
  const row = await env.DB.prepare('SELECT hits, window_start FROM throttle WHERE ip_hash = ?')
    .bind(key).first();

  if (!row) {
    await env.DB.prepare('INSERT INTO throttle (ip_hash, hits, window_start) VALUES (?, 1, ?)')
      .bind(key, now).run();
    return false;
  }
  if (row.hits >= MAX_PER_WINDOW) return true;
  await env.DB.prepare('UPDATE throttle SET hits = hits + 1 WHERE ip_hash = ?').bind(key).run();
  return false;
}

async function join(request, env) {
  if (!env.DB) return json({ error: 'The list is not connected yet.' }, 503);

  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return json({ error: 'Send JSON.' }, 415);

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY) return json({ error: 'That request is too large.' }, 413);

  // Read as text and measure before parsing: content-length can lie, and this
  // is the line that keeps anything image-shaped out of the handler.
  const body = await request.text();
  if (body.length > MAX_BODY) return json({ error: 'That request is too large.' }, 413);

  let payload;
  try { payload = JSON.parse(body); } catch { return json({ error: 'That request was not valid JSON.' }, 400); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json({ error: 'That request was not valid JSON.' }, 400);
  }

  const email = cleanEmail(payload.email);
  if (!email) return json({ error: 'That email address does not look right.', field: 'email' }, 422);

  // Consent is a checkbox the fan ticks, so it must arrive as a literal true.
  // A missing, truthy-ish or defaulted value is a no.
  if (payload.consent !== true) {
    return json({ error: 'Tick the box to join the list.', field: 'consent' }, 422);
  }
  const consentText = cleanShort(payload.consentText, 500);
  if (!consentText) return json({ error: 'Consent wording missing.', field: 'consent' }, 422);

  if (await throttled(env, request)) {
    return json({ error: 'Too many signups from here just now. Try again shortly.' }, 429);
  }

  const now = new Date().toISOString();
  const game = cleanShort(payload.game, 60);
  const section = cleanShort(payload.section, 20);
  const attended = payload.attended === true ? 1 : 0;
  const source = cleanShort(payload.source, 40) || 'studio';

  // A fan who signs up again in week 9 is the same fan. Keep the first consent
  // and the first timestamp; move the rest forward, and let an `attended` that
  // was ever true stay true.
  await env.DB.prepare(`
    INSERT INTO fans (email, consent_text, consent_at, game, section, attended, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      game       = COALESCE(excluded.game, fans.game),
      section    = COALESCE(excluded.section, fans.section),
      attended   = MAX(fans.attended, excluded.attended),
      updated_at = excluded.updated_at
  `).bind(email, consentText, now, game, section, attended, source, now, now).run();

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (url.pathname === '/api/health') {
      if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405);
      return json({ ok: true, list: Boolean(env.DB) });
    }
    if (url.pathname === '/api/join') {
      if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
      return join(request, env);
    }
    return json({ error: 'No such endpoint.' }, 404);
  },
};
