# Going live with TapRate

Do these in order. Each step says where to click. Keep every key and secret private: never paste them
into chats, screenshots or code.

---

## 0. Before you start

- A domain name (e.g. `taprate.lk` or `taprate.app`). The app will live at e.g. `https://app.yourdomain.com`
  or the root domain.
- Fill in your business details in `src/lib/site/company.ts` (company name, registration number,
  address, support/privacy/security emails). The Terms and Privacy pages show a red warning until you do.
  Have both pages reviewed by a lawyer.
- Change the placeholder prices in `/admin` → Pricing after launch (or in the database seed).

## 1. Supabase (production project)

Use a **separate project** for production (keep your current one for testing).

1. Create the project. Region: **Singapore** (closest to Sri Lanka). Untick "auto-expose new tables".
2. SQL Editor: run every file in `supabase/migrations/` **in order** (0001 → 0011).
3. Authentication → URL Configuration:
   - Site URL: `https://YOUR-DOMAIN`
   - Redirect URLs: `https://YOUR-DOMAIN/auth/callback`
4. Authentication → Emails → **SMTP Settings**: turn on custom SMTP with Resend (step 3 below gives you the
   key). Supabase's built-in email only sends a few emails an hour, which isn't enough for sign-ups.
   - Host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API key,
     sender `no-reply@YOUR-DOMAIN`.
5. Authentication → Policies/Settings: turn on **leaked password protection** if your plan has it.
6. Backups: the **Pro plan** has daily backups (and point-in-time recovery as an add-on). On the Free plan,
   run `node scripts/backup.mjs` regularly (see "Backups" below).
7. Make yourself the product admin (SQL Editor):
   ```sql
   insert into public.platform_admins (user_id, note)
   select id, 'Product owner' from auth.users where email = 'you@example.com';
   ```
   (Sign up on the live site first, then run this.)

## 2. Vercel (hosting)

> Vercel's free **Hobby** plan is for personal, non-commercial use. A paid product needs **Pro**
> (check Vercel's current terms and pricing).

1. vercel.com → Add New → Project → import the GitHub repo `kasunsameera83/taprate`.
2. Settings → Environment Variables (Production). Generate each secret with:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_APP_URL` | `https://YOUR-DOMAIN` (no trailing slash) |
   | `NEXT_PUBLIC_SUPABASE_URL` | production Supabase URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | production service role key (secret) |
   | `LINK_SIGNING_SECRET` | new random secret |
   | `RESPONSE_TOKEN_SECRET` | new random secret (different) |
   | `IP_HASH_SALT` | new random secret (different) |
   | `CRON_SECRET` | new random secret (different) |
   | `RESEND_API_KEY` | from Resend |
   | `ALERT_FROM_EMAIL` | `alerts@YOUR-DOMAIN` |
   | `PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET` | from PayHere (live) |
   | `PAYHERE_SANDBOX` | `false` |
   | `PAYHERE_APP_ID`, `PAYHERE_APP_SECRET` | optional, see PayHere below |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | from Stripe (live) |
   | `RESEND_WEBHOOK_SECRET` | from Resend webhooks (bounces), see step 3 |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | phone alerts: run `node scripts/vapid-keys.mjs` once and paste both |
   | `VAPID_SUBJECT` | `mailto:support@YOUR-DOMAIN` (push services contact this if something's wrong) |
   | `ANTHROPIC_API_KEY` | optional (AI summaries) |
   | `SENTRY_DSN` | optional (error monitoring) |

   Use **new** secrets for production, not the ones from your laptop. Never change
   `LINK_SIGNING_SECRET` later without putting the old one in `LINK_SIGNING_SECRET_PREVIOUS`
   (otherwise rating buttons already sent in emails stop working).
3. Deploy. Then Settings → Domains → add your domain and create the DNS records Vercel shows.
4. Crons are set in `vercel.json` (follow-up reminders, billing, email reports, survey email reminders, clean-up). They run once a
   day and are protected by `CRON_SECRET`.

## 3. Resend (email) and DNS

1. resend.com → Domains → add `YOUR-DOMAIN`. Add the DNS records it shows (**SPF**, **DKIM**) at your
   domain registrar, then click Verify.
2. Also add a **DMARC** record (starts gently, just reports):
   `TXT  _dmarc  v=DMARC1; p=none; rua=mailto:dmarc@YOUR-DOMAIN`
   After a few weeks with no problems, change `p=none` to `p=quarantine`.
3. Create an API key → put it in Vercel (`RESEND_API_KEY`) and in Supabase SMTP (step 1.4).
4. Survey emails (the "Send by email" tab) go out from `ALERT_FROM_EMAIL` with the business's name.
   Webhooks → Add endpoint `https://YOUR-DOMAIN/api/webhooks/resend`, events **email.bounced** and
   **email.complained**. Copy its signing secret (starts with `whsec_`) into Vercel as
   `RESEND_WEBHOOK_SECRET`. Bounced or complaining addresses are then never emailed again, which keeps
   your domain's reputation (and everyone's delivery) healthy.
5. "Send from your own domain" (Scale plan) adds the business's domain to Resend through its API, so
   `RESEND_API_KEY` must be a **full access** key (not "sending access only").
6. Limits: trial businesses can send 100 survey emails a day, paid plans 2,000. Resend's own plan limits
   also apply; upgrade Resend before your customers send more than its plan allows.

## 4. PayHere (LKR)

1. Switch from the sandbox to your **live** merchant account (PayHere must approve your business).
2. Settings → Domains & Credentials → add `YOUR-DOMAIN`. The **Merchant Secret is per domain**: copy the
   one for this domain into Vercel.
3. The notify URL is sent automatically with each payment: `https://YOUR-DOMAIN/api/webhooks/payhere`.
4. Recurring payments must be enabled on your PayHere account (ask PayHere support).
5. Cancelling PayHere plans from inside TapRate uses PayHere's Subscription Manager API, which in live
   mode only accepts whitelisted server IP addresses. Vercel doesn't give fixed IPs on normal plans, so
   until that's solved, cancel PayHere subscriptions in the PayHere merchant portal when a customer asks.
   Stripe cancellations work from inside the app.

## 5. Stripe (USD)

1. Activate your account for live payments. Use **live** keys in Vercel.
2. Developers → Webhooks → Add endpoint `https://YOUR-DOMAIN/api/webhooks/stripe` with these events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`,
   `charge.refunded`, `charge.dispute.created`.
   Copy its signing secret (`whsec_…`) into Vercel.
3. Settings → Billing → **Customer portal**: activate it (used by "Update card").

## 6. Monitoring

- **Errors**: always written to Vercel's logs (Project → Logs). For alerts, create a free Sentry project
  (platform "Next.js" or "JavaScript"), copy its DSN into `SENTRY_DSN`. Personal data is scrubbed first.
- **Uptime**: create a free UptimeRobot (or Better Stack) monitor for `https://YOUR-DOMAIN/api/health`
  every 5 minutes, with email/SMS alerts.

## 7. Final checks before announcing

- [ ] Sign up on the live site with a real email: confirmation email arrives (not in spam).
- [ ] Turn on two-step verification for your own account; `/admin` opens.
- [ ] Create a survey, put the buttons in a Gmail message to yourself, click a rating: it shows up.
- [ ] QR code scanned with a phone opens the rating page.
- [ ] Buy the smallest top-up with PayHere and with Stripe (then refund them in the providers'
      dashboards): responses are added, then removed after the refund.
- [ ] `https://YOUR-DOMAIN/api/health` shows `"ok": true`.
- [ ] Publish the landing page in `/admin`, check it on a phone.
- [ ] Run a load test against a **staging** deployment: `BASE_URL=https://... node scripts/load-test.mjs`.
- [ ] Make a backup (below) and practise restoring it into a test project once.

## Backups

```
DATABASE_URL="postgresql://..." node scripts/backup.mjs
```
Needs the PostgreSQL client tools. Saves to `backups/` (never committed to git). Store copies somewhere
private and encrypted (they contain customer data). Restore into a **test** project first:
`pg_restore --clean --no-owner -d "<test connection string>" backups/<file>.dump`

## If something goes wrong

- Rotate a leaked key immediately in the provider's dashboard, update Vercel, redeploy.
- Suspend a misbehaving business in `/admin` → Businesses.
- Every admin action is in `/admin` → Admin log; every business action in Settings → Activity.
