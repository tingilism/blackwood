// ============================================================
//  api/_lib.js  —  shared security + validation helpers
//  Imported by api/contract.js (no DB in this deployment)
// ============================================================


// ---- Sanitization ------------------------------------------------------------
// Strip control chars, zero-width chars, BOM. Always trim. Hard ceiling.
export function clean(value, max = 2000) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200B-\u200F\uFEFF]/g, '')
    .trim()
    .slice(0, max);
}

// ---- Field validators --------------------------------------------------------
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const NAME_RE  = /^[\p{L}\s.\-']{1,80}$/u;
const PHONE_RE = /^[\d\s().+\-x,]{7,25}$/;

export function isEmail(v) { return typeof v === 'string' && v.length <= 120 && EMAIL_RE.test(v); }
export function isName(v)  { return typeof v === 'string' && NAME_RE.test(v); }
export function isPhone(v) { return typeof v === 'string' && PHONE_RE.test(v); }

// ---- Origin allow-list -------------------------------------------------------
// Only accept submissions that originated from our own site.
export function originAllowed(req) {
  const allow = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length === 0) return true; // not configured yet → don't hard-block
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  return allow.some((a) => origin === a || referer.startsWith(a));
}

// ---- Bot defense: honeypot + submission timing -------------------------------
// `_gotcha` must be empty. `_t` is the page-load epoch ms the client embeds;
// anything submitted in under MIN_MS is treated as a bot.
const MIN_MS = 3000;
export function looksLikeBot(body) {
  if (typeof body._gotcha === 'string' && body._gotcha.trim() !== '') return true;
  const t = Number(body._t);
  if (Number.isFinite(t) && Date.now() - t < MIN_MS) return true;
  return false;
}

// ---- Rate limiting (intentionally absent in DB-less deployment) --------------
// See DEPLOY.md / contract.js for the design choice. Bot detection via the
// honeypot field still runs, and Vercel applies platform-level edge limits.
// To restore DB-backed rate limiting, re-add `@vercel/postgres` to dependencies,
// re-import { sql }, and bring back the isRateLimited() function from git history.

// ---- Client IP ---------------------------------------------------------------
export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// ---- Robust body parsing -----------------------------------------------------
// Accepts JSON or urlencoded/multipart FormData.
export async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body; // Vercel already parsed JSON
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const ct = (req.headers['content-type'] || '').toLowerCase();

  if (ct.includes('application/json')) {
    try { return JSON.parse(raw || '{}'); } catch { return {}; }
  }
  // urlencoded or multipart → URLSearchParams handles urlencoded;
  // the front-end sends FormData which Vercel delivers as urlencoded here.
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params.entries()) {
    if (k.endsWith('[]')) {
      const key = k.slice(0, -2);
      (out[key] = out[key] || []).push(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---- Standard JSON responder -------------------------------------------------
export function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

// ---- HTML escaping for email bodies -----------------------------------------
// Emails are HTML; user data must be escaped before interpolation.
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
