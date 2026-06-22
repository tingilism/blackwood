# Blackwood Landscaping — Deployment Guide

The full customer flow:

> Customer fills the contract form → server validates & stores it →
> **you** get an email with everything → **customer** gets a branded
> "we received your inquiry" confirmation.

Everything below is required for that to work end to end. The code is
done; these are the account/config steps only you can do.

---

## 0. Prerequisites (one-time)

- A [Vercel](https://vercel.com) account (free Hobby tier is fine).
- The Vercel CLI: `npm i -g vercel`
- Node 20+ locally.

---

## 1. The domain (this is the real blocker)

You cannot send confirmation emails that reach inboxes without a domain
you own and verify. There is no workaround — this is how email
anti-spoofing (SPF/DKIM/DMARC) works.

1. Buy the domain. Recommended: **Cloudflare Registrar** (at-cost,
   ~$10/yr, no markup) — because you also get Cloudflare's free
   CDN/DDoS shield in the same dashboard, which is your layer-3/4
   DDoS protection from the earlier conversation.
   Namecheap/Porkbun also fine.
2. Point the domain's DNS at Cloudflare (Cloudflare walks you through
   this if you register there — it's automatic).

You can do everything else first and come back to add the verified
domain at the end. Nothing below is blocked except the final email step.

---

## 2. Resend (email sending)

1. Create an account at https://resend.com
2. **Add Domain** → enter your domain → Resend shows ~3 DNS records
   (one MX/SPF, one or two DKIM `CNAME`s, one DMARC `TXT`).
3. Paste those records into Cloudflare DNS (or wherever your DNS lives).
4. Wait for Resend to show the domain **Verified** (minutes to a few hrs).
5. Create an **API key** → copy it (starts `re_…`).

> Testing before the domain is ready: Resend lets you send from
> `onboarding@resend.dev`, but **only to your own Resend account email**.
> Good enough to smoke-test the flow; not for real customers.

---

## 3. Database — intentionally none

This deployment runs **without a database**. Every quote submission emails
you (and the customer) directly via Resend. The quotes live in your Yahoo
inbox, which is where you'll review them anyway.

**Reviews are added manually.** When a customer sends you a real review
(by phone, email, or in person), edit the `reviews` array near the bottom
of `index.html`:

```js
const reviews = [
  { rating: 5, message: "They did a great job on my front yard...", name: "Pat M.", date: "Spring 2026" },
];
```

Save, push to deploy. The review appears on the site within ~30 seconds.

If you later want database-backed quote storage and a customer-facing
review submission form, both are easy to restore — `_lib.js` and
`contract.js` have commented stubs explaining what to add back, and
the schema is recoverable from git history.

---

## 4. Environment variables

In Vercel → project → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | your `re_…` key |
| `MAIL_FROM` | `Blackwood Landscaping <office@blackwood-landscaping.com>` (domain must be Resend-verified) |
| `OFFICE_INBOX` | wherever you want intake notifications to land |
| `ALLOWED_ORIGINS` | `https://blackwood-landscaping.com,https://www.blackwood-landscaping.com` |

`POSTGRES_URL` is added automatically in step 3. See `.env.example`
for a local-dev copy.

---

## 5. Deploy

```bash
cd blackwood
npm install
vercel            # first run links/creates the project
vercel --prod     # production deploy
```

Add your custom domain in Vercel → project → **Domains**.

---

## 6. Verify the whole flow

1. Open the live site, fill the contract form **slowly** (>3 seconds),
   submit. You should see the on-screen "received" message.
2. Check `OFFICE_INBOX` — the formatted intake email should arrive.
3. Check the address you typed in the form — the customer confirmation
   should arrive (check spam the first time; once DKIM/DMARC are
   verified it lands in inbox).

### Test the defenses
- Submit the form in <3 seconds → silently dropped (fake success, no
  email sent). Server-side, so disabling JS doesn't help an attacker.
- The honeypot field (hidden from humans) catches bots — they fill it,
  the server silently 200s without emailing.
- `curl -X POST https://blackwood-landscaping.com/api/contract` with no/foreign
  Origin → HTTP 403.

---

## 7. Reviews — adding them by hand

There is no submission form on the site. When a customer sends you a
review by phone, email, or text, edit `index.html` and add an entry to
the `reviews` array near the bottom of the inline `<script>`:

```js
const reviews = [
  { rating: 5, message: "They did a great job on my front yard...", name: "Pat M.", date: "Spring 2026" },
];
```

Push to deploy (Vercel redeploys automatically on git push, ~30s).
The new review appears on the site.

---

## 8. Data retention (privacy notice compliance)

The privacy notice promises an 18-month retention period. With no database,
the only place customer data lives is your Yahoo inbox. Set a recurring
reminder to delete intake emails older than 18 months, or use Yahoo's
search-by-date and delete in bulk every six months.

---

## What's protecting you (recap)

| Threat | Defense |
|---|---|
| Spam / bots | Honeypot + 3s timing, **server-side** (JS-disable can't bypass) |
| Confirmation-email relay abuse | Per-email rate limit (3/hr contract, 2/day review) |
| Flood / abuse | Per-IP rate limit (5/hr) + Cloudflare in front |
| XSS in reviews | Stored unapproved; rendered via `textContent`; HTML-escaped in emails |
| Injection | Parameterized SQL only; every field sanitized + length-capped |
| PII exposure | HTTPS-forced, no cookies, strict headers, 18-mo retention, privacy notice |
| Forged requests | Origin/Referer allow-list (403) |
| Clickjacking | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
