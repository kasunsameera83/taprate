# TapTruly SEO plan

## What's built in
- `sitemap.xml` (public pages + every published blog post) and `robots.txt` (private areas blocked, sitemap linked).
- Page titles and descriptions on every public page; sign-in and password pages are `noindex`.
- Canonical URLs (`metadataBase` = NEXT_PUBLIC_APP_URL), so no duplicate pages.
- Social preview image (`src/app/opengraph-image.png`, 1200×630) for WhatsApp, Facebook, LinkedIn, X.
- Structured data (schema.org): Organization, WebSite, SoftwareApplication (with real prices), FAQPage (landing FAQ),
  BlogPosting + BreadcrumbList on each post.
- Fast pages (light JavaScript, no layout shift, server in Singapore).

## Keywords to target
Search volumes aren't known yet: after launch, check real numbers in Google Search Console and Google Keyword Planner,
and double down on what brings sign-ups.

| Group | Keywords | Where |
|---|---|---|
| Core product | one-click survey, one-click customer feedback, email feedback buttons, CSAT survey tool, customer satisfaction survey software, email signature survey, NPS survey tool, CES survey | Home page title/description, headings, features |
| Helpdesks | Zendesk CSAT survey, one-click CSAT Zendesk, Freshdesk satisfaction survey, Gorgias CSAT, Intercom CSAT, Front CSAT, Help Scout ratings, Outlook signature survey | Blog how-to guides (one per helpdesk) |
| Alternatives | Delighted alternative, Customer Thermometer alternative, Simplesat alternative, Nicereply alternative | `/switch-from-delighted` + one comparison post each |
| Channels | QR code feedback, WhatsApp feedback survey, feedback kiosk tablet, restaurant feedback QR code | Blog + features |
| Sri Lanka | customer feedback system Sri Lanka, customer satisfaction survey Sri Lanka, QR code feedback Sri Lanka, Sinhala feedback form, Tamil feedback form | Blog posts written for Sri Lankan businesses; pricing in Rs |
| How-to (top of funnel) | how to measure customer satisfaction, increase survey response rate, respond to negative feedback, CSAT vs NPS vs CES, win back unhappy customers, customer feedback email template | Blog |

## Next 10 blog posts (one main keyword each)
1. CSAT vs NPS vs CES: which customer score should you track? (*CSAT vs NPS*)
2. How to add one-click satisfaction ratings to Zendesk (*Zendesk CSAT survey*)
3. Delighted is gone: the best Delighted alternatives in 2026 (*Delighted alternative*)
4. How to reply to an unhappy customer (with templates) (*respond to negative feedback*)
5. QR code feedback for restaurants and shops in Sri Lanka (*QR code feedback Sri Lanka*)
6. Why survey response rates are low, and 7 ways to fix it (*increase survey response rate*)
7. Customer feedback in Sinhala and Tamil: why language matters (*Sinhala feedback form*)
8. Add a satisfaction survey to your Outlook or Gmail signature (*email signature survey*)
9. Customer Thermometer alternative: one-tap ratings with follow-ups (*Customer Thermometer alternative*)
10. Winning back unhappy customers: a simple 4-step loop (*win back unhappy customers*)

Tips: put the keyword in the title, the web address, the first paragraph and one heading; write for people first;
link each post to the home page and to 1–2 other posts; add a cover picture (1200×630).

## After launch (once)
1. Google Search Console: add `taptruly.com` (Domain property), verify with the TXT record it gives you (add it in Porkbun),
   then submit `https://taptruly.com/sitemap.xml`.
2. Bing Webmaster Tools: import from Search Console (one click).
3. Check the social preview: paste the link into WhatsApp or https://www.opengraph.xyz.
4. Check structured data: https://search.google.com/test/rich-results with `https://taptruly.com`.
5. Ask for links: list TapTruly on G2, Capterra, Product Hunt, and Sri Lankan startup directories.
