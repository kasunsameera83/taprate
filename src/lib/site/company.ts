// Your business details for the Terms and Privacy pages, receipts and emails.
// >>> Fill these in before going live (anything in [square brackets] is a placeholder). <<<
export const COMPANY = {
  productName: "TapTruly",
  legalName: "TapTruly",
  /** Leave empty until the business registration is complete; it's hidden while empty. */
  registrationNo: "",
  address: "Sri Lanka",
  phone: "+94 71 307 4888",
  supportEmail: "support@taptruly.com",
  privacyEmail: "privacy@taptruly.com",
  securityEmail: "security@taptruly.com",
  governingLaw: "the laws of the Democratic Socialist Republic of Sri Lanka",
  courts: "the courts of Colombo, Sri Lanka",
  /** Change this date whenever the Terms, Privacy or Refund Policy change; people agree to this version. */
  termsVersion: "2026-11-01",
  effectiveDate: "1 November 2026",
};

export const hasPlaceholders = () => Object.values(COMPANY).some((v) => v.includes("["));

/** Services that process data for us (shown in the Privacy Policy). Keep in step with what you use. */
export const SUBPROCESSORS = [
  { name: "Supabase", purpose: "Database, sign-in and file storage", location: "Region you choose (e.g. Singapore)" },
  { name: "Vercel", purpose: "Hosting the website and app", location: "Global" },
  { name: "Resend", purpose: "Sending emails (alerts, reports, sign-in)", location: "USA" },
  { name: "PayHere", purpose: "Card and mobile payments in LKR", location: "Sri Lanka" },
  { name: "Stripe", purpose: "Card payments in USD", location: "USA / Ireland" },
  { name: "Anthropic (Claude)", purpose: "AI summaries, only if a business turns them on", location: "USA" },
];
