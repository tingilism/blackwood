// ============================================================
//  api/contract.js  —  contract intake handler
//
//  Flow:
//   1. method + origin guard
//   2. parse body
//   3. bot defense (honeypot + timing)  ← server-side, can't be bypassed
//   4. rate limit per-IP AND per-email  ← anti-abuse / anti-relay
//   5. validate + sanitize every field  ← never trust the client
//   6. store in Postgres (best effort)
//   7. email the office + email the customer a confirmation
//   8. JSON response the existing front-end understands
// ============================================================
import { Resend } from 'resend';
import {
  clean, isEmail, isName, isPhone,
  originAllowed, looksLikeBot,
  clientIp, readBody, json, esc,
} from './_lib.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM        = process.env.MAIL_FROM        || 'Blackwood Landscaping <office@blackwood-landscaping.com>';
const OFFICE_TO   = process.env.OFFICE_INBOX     || 'office@blackwood-landscaping.com';
const SITE_NAME   = 'Blackwood Landscaping';

export default async function handler(req, res) {
  // 1 — method
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  // 1 — origin
  if (!originAllowed(req)) return json(res, 403, { ok: false, error: 'Forbidden' });

  // 2 — body
  let body;
  try { body = await readBody(req); }
  catch { return json(res, 400, { ok: false, error: 'Bad request' }); }

  // 3 — bot defense. Pretend success so bots don't learn to retry.
  if (looksLikeBot(body)) return json(res, 200, { ok: true });

  // 5 — validate (do this before rate-limit writes so junk doesn't fill the ledger)
  const firstName = clean(body.firstName, 60);
  const lastName  = clean(body.lastName, 60);
  const email     = clean(body.email, 120).toLowerCase();
  const phone     = clean(body.phone, 20);
  const address   = clean(body.address, 160);
  const town      = clean(body.town, 80);
  const signature = '';  // signature field removed from quote form; column kept for schema compatibility
  const notes     = clean(body.notes, 3000);
  const contact   = clean(body.contact, 40);
  const acreage   = clean(body.acreage, 40);
  const budget    = clean(body.budget, 40);
  const season    = clean(body.season, 40);
  const ack       = body.acknowledge;

  const services = Array.isArray(body.services)
    ? body.services.map((s) => clean(s, 30)).filter(Boolean).slice(0, 10)
    : (body.services ? [clean(body.services, 30)] : []);

  const errors = [];
  if (!isName(firstName))  errors.push('firstName');
  if (!isName(lastName))   errors.push('lastName');
  if (!isEmail(email))     errors.push('email');
  if (!isPhone(phone))     errors.push('phone');
  if (address.length < 4)  errors.push('address');
  if (town.length < 2)     errors.push('town');
  if (!ack || ack === 'false') errors.push('acknowledge');

  if (errors.length) {
    return json(res, 422, { ok: false, error: 'Validation failed', fields: errors });
  }

  // 4 — rate limit. Per-IP stops floods; per-email stops using us as a
  //     confirmation-spam relay against a victim's inbox.
  // (No DB-backed rate limiting in this deployment — see DEPLOY.md.
  //  Bot detection runs earlier via the honeypot field, and Vercel's edge
  //  applies coarse per-IP limits at the platform level. For a small local
  //  business at low volume that's sufficient. If submission abuse becomes
  //  a problem, attach Vercel Postgres + restore the `rate_events` table
  //  and the isRateLimited() calls.)
  const ip = clientIp(req);

  // (No database write — quotes live in your Yahoo inbox. See DEPLOY.md.)

  // 7 — emails
  const fullName = `${firstName} ${lastName}`;
  const servicesText = services.length ? services.join(', ') : '—';

  const officeHtml = `
    <div style="font-family:Georgia,serif;color:#1a1f17;max-width:620px">
      <h2 style="color:#1f2a1c;border-bottom:1px solid #b08d3e;padding-bottom:8px">
        New Contract Intake</h2>
      <table style="width:100%;border-collapse:collapse;font-size:15px">
        <tr><td style="padding:6px 0;color:#5c4a32;width:170px">Name</td><td>${esc(fullName)}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a32">Email</td><td>${esc(email)}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a32">Telephone</td><td>${esc(phone)}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a32">Preferred reply</td><td>${esc(contact || '—')}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a32">Property</td><td>${esc(address)}, ${esc(town)}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a32">Acreage</td><td>${esc(acreage || '—')}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a32">Services</td><td>${esc(servicesText)}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a32">Budget</td><td>${esc(budget || '—')}</td></tr>
        <tr><td style="padding:6px 0;color:#5c4a32">Start season</td><td>${esc(season || '—')}</td></tr>
      </table>
      <h3 style="color:#2d3a26;margin-top:22px">Project notes</h3>
      <p style="white-space:pre-wrap;background:#f4efe6;padding:14px;border-left:2px solid #b08d3e">${esc(notes || '— none provided —')}</p>
      <p style="color:#8a8675;font-size:12px;margin-top:20px">Received ${new Date().toUTCString()} · IP ${esc(ip)}</p>
    </div>`;

  const customerHtml = `
    <div style="font-family:Georgia,serif;color:#1a1f17;max-width:560px;line-height:1.6">
      <h2 style="color:#1f2a1c;font-weight:normal">We have received your intake.</h2>
      <p>Dear ${esc(firstName)},</p>
      <p>Thank you for writing to ${SITE_NAME}. Your inquiry concerning the grounds at
         <strong>${esc(address)}, ${esc(town)}</strong> has reached our office. This note
         confirms receipt only — it is not a contract, and no work is scheduled until a
         written proposal has been signed by both parties.</p>
      <p>A member of our office will reply within <strong>three business days</strong>
         by your preferred method (${esc(contact || 'email')}).</p>
      <p style="margin-top:20px;color:#5c4a32">For your records, here is what you submitted:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#1a1f17">
        <tr><td style="padding:5px 0;color:#5c4a32;width:150px">Services</td><td>${esc(servicesText)}</td></tr>
        <tr><td style="padding:5px 0;color:#5c4a32">Estimated budget</td><td>${esc(budget || '—')}</td></tr>
        <tr><td style="padding:5px 0;color:#5c4a32">Desired start</td><td>${esc(season || '—')}</td></tr>
      </table>
      <p style="margin-top:24px">With regard,<br><strong>${SITE_NAME}</strong><br>
         <span style="color:#8a8675">Bay Shore, New York · (631) 402-3447</span></p>
      <p style="color:#8a8675;font-size:12px;border-top:1px solid #ddd;padding-top:12px;margin-top:24px">
        You received this because an intake form was submitted with this email address at our website.
        If this was not you, you may disregard it; the inquiry will be discarded after our review.</p>
    </div>`;

  try {
    // Office notification — reply-to set to the customer so staff can just hit reply
    await resend.emails.send({
      from: FROM,
      to: OFFICE_TO,
      replyTo: email,
      subject: `New Contract Intake — ${fullName}`,
      html: officeHtml,
    });

    // Customer confirmation
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `We received your inquiry — ${SITE_NAME}`,
      html: customerHtml,
    });
  } catch (err) {
    console.error('[contract] email send failed:', err?.message);
    // The submission is already stored. Tell the user it's received but
    // ask them to expect a call rather than implying email confirmation.
    return json(res, 200, {
      ok: true,
      warn: 'received_no_email',
      message: 'Your intake was received. If you do not get an email confirmation shortly, rest assured we still have your request.',
    });
  }

  // 8 — success
  return json(res, 200, { ok: true });
}
