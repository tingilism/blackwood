# DNS Setup — GoDaddy + Vercel + Resend

A concrete, click-by-click walkthrough for getting **blackwood-landscaping.com**
live with working email through Resend. Total time: about 30–45 minutes,
most of which is just waiting for DNS to propagate.

> **Important:** Don't change GoDaddy's nameservers. Leave them as the default
> GoDaddy nameservers. You're only **adding records** to the existing DNS zone.

---

## Before you start

You'll need accounts at:
- **GoDaddy** — already have it (domain is bought there)
- **Vercel** — sign up at https://vercel.com (free, use GitHub or email)
- **Resend** — sign up at https://resend.com (free, 3,000 emails/month)

Have the Blackwood project folder ready on your machine (the `blackwood/`
directory we built). You'll deploy it to Vercel at the end.

---

## Step 1 — Push code to a Git host (5 min)

Vercel auto-deploys from Git, so the project needs to live in a repo.

1. Create a new repo on GitHub (private is fine): `blackwood-landscaping`
2. From your local terminal, inside the `blackwood/` folder:
   ```
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/blackwood-landscaping.git
   git push -u origin main
   ```

---

## Step 2 — Create the Vercel project (5 min)

1. Go to https://vercel.com/new
2. Click **Import Git Repository** → pick the `blackwood-landscaping` repo
3. **Framework Preset:** Other (it's static HTML — Vercel auto-detects)
4. **Root Directory:** leave as `./`
5. **Build Command:** leave empty
6. **Output Directory:** leave empty
7. Click **Deploy**

The first deploy will run and give you a temporary URL like
`blackwood-landscaping-abc123.vercel.app`. That's the staging URL — your real
domain isn't connected yet. Visit it, see the site, confirm photos load.

---

## Step 3 — Connect the domain in Vercel (2 min, then wait)

1. In Vercel, open your project → **Settings** → **Domains**
2. Click **Add** → type `blackwood-landscaping.com` → click **Add**
3. Vercel will say something like: *"To configure your domain, set the
   following records on your DNS provider."* It will show you two records:

   | Type  | Name  | Value                  |
   |-------|-------|------------------------|
   | A     | `@`   | `76.76.21.21`          |
   | CNAME | `www` | `cname.vercel-dns.com` |

   **Copy these values exactly.** Vercel sometimes changes the IP — use
   whatever it shows you, not the example above.

4. Also click **Add** for `www.blackwood-landscaping.com` so both versions work
   (Vercel will auto-redirect www → apex or vice versa).

Leave this tab open — you'll come back to it.

---

## Step 4 — Add the Vercel records at GoDaddy (5 min)

1. Open https://dcc.godaddy.com/control/portfolio → click **DNS** next to
   `blackwood-landscaping.com`. (Or: Products → All Products → Domains →
   click the domain → DNS section)
2. You'll see a list of existing records (parking page CNAME, etc.). It's
   fine to leave those — adding the new ones overrides where it needs to.
3. Click **Add New Record** for each of these:

   **Record 1 — A record for the apex domain:**
   - **Type:** `A`
   - **Name:** `@`
   - **Value:** the IP Vercel gave you (e.g., `76.76.21.21`)
   - **TTL:** `1 Hour` (default)
   - Save

   **Record 2 — CNAME for www:**
   - **Type:** `CNAME`
   - **Name:** `www`
   - **Value:** `cname.vercel-dns.com` (exactly this — don't add a period
     at the end, GoDaddy adds it for you)
   - **TTL:** `1 Hour`
   - Save

4. **Important:** Check if there's an existing `A` record at `@` already
   pointing at GoDaddy's parking page (something like `Parked` or an IP
   like `34.x.x.x`). **Delete it** so it doesn't conflict with the new
   one. Same for any existing `CNAME` at `www`.

5. Go back to the Vercel tab and click **Refresh**. Within 10 minutes,
   Vercel should show **Valid Configuration** ✓. SSL certificate is issued
   automatically once DNS resolves.

**Test:** Open `https://blackwood-landscaping.com` in a fresh browser tab.
You should see your site with a green lock in the address bar.

---

## Step 5 — Add the Resend sending domain (3 min, then wait)

1. Go to https://resend.com → sign in → **Domains** → **Add Domain**
2. Enter `blackwood-landscaping.com` → click **Add**
3. Resend will show you **3 DNS records** to add — typically:

   | Type  | Name                         | Value                                      |
   |-------|------------------------------|--------------------------------------------|
   | MX    | `send`                       | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |
   | TXT   | `send`                       | `v=spf1 include:amazonses.com ~all`        |
   | TXT   | `resend._domainkey`          | (a long DKIM string Resend generates)      |

   **Don't copy mine — use what Resend actually shows you. Region and
   selector names vary.**

4. Optionally Resend also recommends a **DMARC** record:
   - **Type:** `TXT`
   - **Name:** `_dmarc`
   - **Value:** `v=DMARC1; p=none; rua=mailto:blackwoodlandscaping@yahoo.com`

   Add this even though Resend marks it as optional — it tells email providers
   how to handle suspicious mail and improves deliverability.

---

## Step 6 — Add the Resend records at GoDaddy (5 min)

Same flow as Step 4 — open the DNS panel for `blackwood-landscaping.com` and
**Add New Record** for each one Resend gave you.

**GoDaddy gotchas to know:**

- For `Name`, type just the subdomain part. If Resend says
  `resend._domainkey.blackwood-landscaping.com`, you only enter
  `resend._domainkey` in the Name field. GoDaddy adds your domain automatically.
- For TXT records, paste the full value **including the quotes Resend shows**.
  GoDaddy handles the wrapping correctly.
- For the MX record, GoDaddy asks for `Priority` separately — use `10`.

After adding all 3–4 records, wait 5–10 minutes, then go back to Resend and
click **Verify DNS Records**. All three should show ✓.

---

## Step 7 — Get your Resend API key (1 min)

1. In Resend → **API Keys** → **Create API Key**
2. Name: `blackwood-production`
3. Permission: **Sending access** (not full access — least privilege)
4. Domain: select `blackwood-landscaping.com`
5. **Copy the key immediately** — Resend only shows it once. It starts with `re_`.

---

## Step 8 — Set environment variables in Vercel (2 min)

1. In Vercel → your project → **Settings** → **Environment Variables**
2. Add these four, one at a time. Make sure each is enabled for all three
   environments (Production, Preview, Development):

   | Key                | Value                                                                 |
   |--------------------|-----------------------------------------------------------------------|
   | `RESEND_API_KEY`   | (the `re_...` key from Step 7)                                        |
   | `MAIL_FROM`        | `Blackwood Landscaping <office@blackwood-landscaping.com>`            |
   | `OFFICE_INBOX`     | `blackwoodlandscaping@yahoo.com`                                      |
   | `ALLOWED_ORIGINS`  | `https://blackwood-landscaping.com,https://www.blackwood-landscaping.com` |

3. After adding all four, go to **Deployments** → click the latest deploy
   → click the **⋮** menu → **Redeploy** so the new env vars take effect.

---

## Step 9 — Optional: email forwarding for `office@` (3 min)

If a customer hits "Reply" on a confirmation email, the reply goes to
`office@blackwood-landscaping.com`. By default that address doesn't exist
and the reply bounces.

To make replies land in your Yahoo inbox:

1. In GoDaddy → **Products** → **Email & Office** → look for **Email
   Forwarding** (free with the domain)
2. Add forwarding rule:
   - From: `office@blackwood-landscaping.com`
   - To: `blackwoodlandscaping@yahoo.com`
3. GoDaddy will add an MX record automatically. **One catch:** this MX
   record can conflict with the Resend MX you added in Step 6. If GoDaddy
   complains or replies stop working, you may need to use a different
   forwarding service (like ImprovMX, free for one alias) instead.

If the forwarding gets fussy, the simpler fallback is: in the confirmation
email template, add a line like "For a faster response, reply to
blackwoodlandscaping@yahoo.com directly." Lower-tech but always works.

---

## Step 10 — Smoke test (5 min)

1. Open `https://blackwood-landscaping.com` in a private/incognito window
2. Scroll to the quote form, fill it out with **your own real email**
3. Submit
4. Within ~30 seconds you should see:
   - On-screen "thank you" message
   - An email to your Yahoo inbox with the formatted intake
   - A customer confirmation email at the address you typed in the form
5. Check the **first** confirmation email lands in inbox, not spam. If it
   does land in spam, the SPF/DKIM/DMARC records may not have fully
   propagated — wait an hour and test again with a different email.

If anything's broken: in Vercel, click your project → **Deployments** →
latest → **Logs** → look at the function logs for errors.

---

## Quick reference — final state of your DNS zone

After all this, your GoDaddy DNS zone for `blackwood-landscaping.com` should
have these records (plus whatever GoDaddy adds by default):

| Type  | Name                  | Value                                      | Purpose                |
|-------|-----------------------|--------------------------------------------|------------------------|
| A     | `@`                   | (Vercel's IP)                              | Website (apex)         |
| CNAME | `www`                 | `cname.vercel-dns.com`                     | Website (www variant)  |
| MX    | `send`                | `feedback-smtp....amazonses.com` pri 10    | Resend bounce handling |
| TXT   | `send`                | `v=spf1 include:amazonses.com ~all`        | SPF (sender policy)    |
| TXT   | `resend._domainkey`   | (long DKIM key from Resend)                | DKIM (email signing)   |
| TXT   | `_dmarc`              | `v=DMARC1; p=none; rua=mailto:...`         | DMARC policy           |
| MX    | `@` (optional)        | (GoDaddy/ImprovMX forwarder)               | Reply forwarding       |

---

## Troubleshooting common issues

**Site shows GoDaddy parking page after 30 min**
You probably left the old `A` record at `@` in place. Go to GoDaddy DNS,
delete every `A` record at `@` except Vercel's, save, wait 10 min.

**Vercel says "Invalid Configuration"**
Usually means the `A` record value doesn't match what Vercel expects.
Re-check Step 3 — Vercel sometimes updates the IP. Whatever Vercel shows
you in the Domains panel is the source of truth.

**Resend won't verify the domain**
Usually a TXT record copy-paste error. The DKIM value is long — make sure
you didn't truncate it. In GoDaddy, hover over the saved TXT record value
and verify it matches Resend's character-for-character.

**Emails land in spam**
Wait 24 hours after DNS verification — email reputation takes time. After
that, send 5–10 test emails to different providers (Gmail, Yahoo, Outlook).
Persistent spam-folder landing means DMARC needs strengthening; change
`p=none` to `p=quarantine` after a few weeks of clean sending.

**Form submits but no email arrives**
Vercel function logs are the source of truth. Common causes:
- `RESEND_API_KEY` not set, or set without redeploying
- `MAIL_FROM` uses an unverified domain
- Resend account is in test mode (only sends to verified addresses)

---

That's it. Anything that breaks, the Vercel logs and Resend logs will tell
you what's wrong — those two tabs are 90% of the troubleshooting.
