# TapRate

One-click customer feedback inside the emails you already send. Add rating buttons to an email
signature or helpdesk template; customers click once; you see who is happy and who needs a call back.

Stack: Next.js 15 (App Router) + Supabase (Postgres, Auth) + Tailwind CSS 4. Working name — rename freely.

## What's in the MVP

- Sign up / sign in with email confirmation
- Surveys: question, rating scale (thumbs, 3 faces, 5 faces, 5 stars, NPS 0–10), brand colour, thank-you message, optional comment
- Copy-paste buttons for Gmail/Outlook signatures and Zendesk, Freshdesk, HubSpot, Mailchimp or custom merge tags
- One-click recording with scanner protection, thank-you page with optional comment
- Dashboard: satisfaction %, NPS, responses per day, results per agent
- Responses list with filters, CSV export
- Email alerts for low ratings (via Resend, optional)
- Credits: one credit per confirmed response; survey shows "closed" when credits run out

## Setup

1. **Install**: Node 20.9+ (Node 22 LTS or newer recommended).
   ```bash
   npm install
   ```
2. **Create a Supabase project** at supabase.com.
3. **Create the database**: open *SQL Editor* and run each file in `supabase/migrations/` **in order**
   (`0001_init.sql`, `0002_sentiment.sql`, `0003_team_security.sql`, `0004_act_on_feedback.sql`, `0005_channels_integrations.sql`, ...). Each file only needs running once.
   (Or with the Supabase CLI: `supabase db push`.)
4. **Auth settings** (Authentication → Sign In / Providers, and URL Configuration):
   - Email provider on, **Confirm email** on
   - Minimum password length 10; turn on leaked-password protection if your plan has it
   - Site URL: your app URL (e.g. `http://localhost:3000` locally)
   - Redirect URLs: add `<your app URL>/auth/callback` and `<your app URL>/auth/recovery`
   - Authentication → Sign In / Providers → Email: turn on **Secure email change**
   - Authentication → Multi-Factor: make sure **TOTP (authenticator app)** is enabled
   - Optional, so reset links work on any device: Authentication → Emails → "Reset password" template,
     set the link to `{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&type=recovery`
5. **Environment**: copy `.env.example` to `.env.local` and fill it in. Generate each secret with
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
   Every secret must be different. `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to the browser.
6. **Run**: `npm run dev`, open http://localhost:3000.

### Optional

- **Alerts**: set `RESEND_API_KEY` and `ALERT_FROM_EMAIL` (a sender on a domain verified in Resend).
- **Rate-limit table cleanup**: enable the `pg_cron` extension and schedule
  `select cron.schedule('rate-limit-cleanup', '0 3 * * *', 'select public.rate_limit_cleanup()');`

## Tests

```bash
npm test          # unit tests: signing, bot detection, CSRF, validation, CSV, stats (37 tests)
npm run test:db   # database security tests (needs psql and a THROWAWAY Postgres)
npm run build     # production build
npm run typecheck # after a build (needs next-env.d.ts)
```

`test:db` needs `TEST_DATABASE_URL`, e.g. a local Docker Postgres:
```bash
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name taprate-test postgres:16
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
```
It refuses to run against a `supabase.co` URL. GitHub Actions (`.github/workflows/ci.yml`) runs all of
this on every push.

## Deploy

Vercel works out of the box: import the repo, add the environment variables from `.env.example`,
set `NEXT_PUBLIC_APP_URL` to the https URL, and add `<url>/auth/callback` to Supabase redirect URLs.
On another host, make sure the proxy in front of the app **overwrites** `X-Forwarded-For` / `X-Real-IP`
(the app trusts them for rate limiting).

## Security design

The rule: **the browser validates for convenience, the server validates for security.**

**Every API route** goes through `secureRoute` (`src/lib/security/route.ts`), which runs, in order:
same-origin (CSRF) check for writes → JSON-only, size-limited body → IP rate limit → session verified
with Supabase → membership + role permission → per-user rate limit → strict validation of route params,
query and body → handler. Errors return generic messages; details are logged server-side only.

**Validation**: one set of Zod schemas (`src/lib/validation/schemas.ts`) used by forms and API alike.
Every object is `.strict()` (unknown fields rejected), text is normalised and stripped of control/bidi
characters, lengths and formats are bounded, URLs must be https.

**Database (second wall)**: Row Level Security on every table. Users only see their own account's rows;
viewers are read-only; nobody can change their own plan or credits (column-level grants); responses
cannot be written or edited by users; the anonymous role has no table access at all. Public clicks go
through two narrow server-only functions. The database also enforces rating ranges and locks a survey's
scale once responses exist. `tests/sql/10_rls_security.test.sql` proves each of these.

**Survey links**: `/r/<surveyId>.<rating>.<signature>` — an HMAC signature means nobody can forge a link
or change the rating. Secrets can be rotated with `LINK_SIGNING_SECRET_PREVIOUS`. Customer/agent/ticket
values filled in by helpdesks can't be signed in advance, so they're validated, stored, and shown as
"unverified".

**Email scanners**: known scanners, previewers, HEAD and prefetch requests record nothing. Every other
click is stored as *pending* and only counts once the thank-you page confirms it from a real browser.
Repeat clicks for the same customer/ticket update one response instead of adding more.

**Other**: per-request CSP nonce, HSTS, frame blocking, no-referrer on survey links, CSV
formula-injection protection, honeypot on comments, no account enumeration on sign-up/sign-in,
salted IP hashes (raw IPs never stored), append-only audit log, open-redirect-free auth callback,
rate limiter fails closed.

## Account & team features

- Password reset (email link, 15-minute window), change password, change email (password required)
- Two-step verification with an authenticator app; enforced by the database for every table
- Team invites with roles: Owner, Admin, Viewer, Agent (agents see only ratings with their name)
- Switch between businesses; leave a business; the last owner can't be removed
- Full data export, delete one customer's data on request, delete the whole business
- Activity log of important changes

## Acting on feedback

- Reasons: customers tap why they rated you; the dashboard shows the top reasons
- Follow-ups: every negative rating becomes a task with an owner, due date, status and notes
- Daily email reminder for overdue follow-ups (`/api/cron/followups`, scheduled in `vercel.json`;
  set `CRON_SECRET` in Vercel)
- Agent leaderboard (agents need a minimum number of ratings to be ranked)
- CES (customer effort, 1–7) rating scale
- "Review us" button for happy customers, and your logo on the thank-you page
  (the `logos` storage bucket is created by migration 0004)

## More ways to collect

- QR codes (SVG download) and a shareable rating page for WhatsApp, SMS and plain links
- Website widget (iframe; only `/w/...` may be embedded in other sites)
- Tablet kiosk mode: secret link per kiosk (only a hash stored), revocable, rate limited
- Every rating records its channel; filter responses by channel
- Integrations: Slack, Microsoft Teams (Workflows webhook), and signed webhooks
  (`X-TapRate-Signature: t=…,v1=HMAC-SHA256`). URLs are stored encrypted (AES-256-GCM) and
  re-checked against private networks before every delivery

## Still to come

Public API, helpdesk integrations, CSV import, billing (PayHere + Stripe), AI summaries,
scheduled reports.
