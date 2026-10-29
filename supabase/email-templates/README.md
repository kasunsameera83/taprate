# TapTruly sign-in emails (Supabase Auth)

Paste these into **Supabase → Authentication → Emails → Templates** (the taptruly project).
Switch each template to the HTML/source editor, replace everything with the file's contents, and set the subject.

| Supabase template | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | `Confirm your TapTruly email` |
| Reset password | `reset-password.html` | `Reset your TapTruly password` |
| Change email address | `change-email.html` | `Confirm your new TapTruly email` |

The links go to `/auth/callback` and `/auth/recovery` with a one-time `token_hash`, so they work on any
device (not only the browser that signed up). They need **Site URL = https://taptruly.com** in
Authentication → URL Configuration. The logo is `public/brand/taptruly-logo-email.png`.
