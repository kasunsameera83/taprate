import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/LegalPage";
import { COMPANY } from "@/lib/site/company";

export const metadata: Metadata = { title: "Terms of Service" };

// A plain-English starting point. Have it reviewed by a lawyer before launch.
export default function TermsPage() {
  const c = COMPANY;
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms are an agreement between you (the business using {c.productName}) and {c.legalName}, {c.address} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or using{" "}
        {c.productName} you agree to them. If you use {c.productName} for a company, you confirm you&rsquo;re allowed to accept these terms for it.
      </p>

      <h2>1. The service</h2>
      <p>
        {c.productName} lets businesses collect one-click ratings and comments from their customers (by email, links, QR codes, website widgets and kiosks), and see
        reports about them. We may improve or change features over time. If we remove something important you pay for, we&rsquo;ll tell you in advance.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 18 years old and able to enter a binding contract to create an account or buy a plan.</li>
        <li>Give accurate details and keep your password and two-step verification safe. You&rsquo;re responsible for what happens in your account.</li>
        <li>Account owners decide who joins their team and what they can see.</li>
        <li>Tell us straight away at {c.securityEmail} if you think your account has been misused.</li>
      </ul>

      <h2>3. Using {c.productName} properly</h2>
      <p>You agree not to:</p>
      <ul>
        <li>send spam, or send rating requests to people you have no lawful reason to contact;</li>
        <li>collect sensitive information you don&rsquo;t need (for example health or financial details) through comments;</li>
        <li>fake, buy or manipulate ratings, or misrepresent ratings to others;</li>
        <li>try to break, overload, reverse-engineer or get around the security of the service, or access other businesses&rsquo; data;</li>
        <li>use the service for anything illegal, harmful or misleading.</li>
      </ul>
      <p>We may suspend accounts that break these rules or put the service or other customers at risk. Where we can, we&rsquo;ll tell you first and give you a chance to fix things.</p>

      <h2>4. Your data and your customers&rsquo; data</h2>
      <p>
        You own the ratings and comments you collect. You let us store and process them only to run {c.productName} for you, as described in our{" "}
        <Link href="/privacy" className="link">
          Privacy Policy
        </Link>
        . You&rsquo;re responsible for having a lawful basis to contact your customers and for telling them how you use their feedback. You can export or delete your
        data at any time from Settings.
      </p>

      <h2>5. Plans, payments and responses</h2>
      <ul>
        <li>Paid plans renew automatically each month or year until you cancel. Each paid period adds the plan&rsquo;s responses to your balance; unused responses roll over.</li>
        <li>You can cancel at any time in Settings → Billing. Your plan stays active until the end of the period you&rsquo;ve paid for.</li>
        <li>
          Refunds follow our{" "}
          <Link href="/refund-policy" className="link">
            Refund Policy
          </Link>
          . Every refund is paid back to the same payment method (card, bank account or wallet) used for the original payment.
        </li>
        <li>Prices are shown, and charged, in Sri Lankan rupees (LKR) or US dollars (USD), including any taxes that apply.</li>
        <li>Top-up responses never expire, but they can&rsquo;t be exchanged for money or moved to another account.</li>
        <li>Payments are handled by PayHere (LKR) or Stripe (USD); their terms apply to the payment itself. Prices may change; changes apply to new purchases, and we&rsquo;ll give notice before a price change affects a renewing plan.</li>
        <li>Promo codes have the conditions shown with them and can be withdrawn at any time before they&rsquo;re used.</li>
      </ul>

      <h2>6. AI summaries</h2>
      <p>
        If an account owner turns on AI summaries, comments are sent to our AI provider to create summaries (with email addresses and phone numbers removed). AI can
        make mistakes; check important conclusions yourself.
      </p>

      <h2>7. Availability</h2>
      <p>
        We work hard to keep {c.productName} running and secure, but we can&rsquo;t promise it will always be available or error-free. Planned maintenance will be done at
        quiet times where possible.
      </p>

      <h2>8. Liability</h2>
      <p>
        To the extent the law allows, we aren&rsquo;t liable for indirect or consequential losses (such as lost profits or business). Our total liability for any claim
        is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits liability that can&rsquo;t be limited by law.
      </p>

      <h2>9. Ending the agreement</h2>
      <p>
        You can stop using {c.productName} and delete your account at any time in Settings. We may end the service for you with 30 days&rsquo; notice, or straight away
        for a serious breach of these terms. After an account is deleted, its data is removed as described in the Privacy Policy.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>If we make important changes, we&rsquo;ll tell account owners by email or in the app before they take effect. Continuing to use the service means you accept them.</p>

      <h2>11. Law</h2>
      <p>
        These terms are governed by {c.governingLaw}, and disputes go to {c.courts}.
      </p>

      <h2>12. Contact</h2>
      <p>
        {c.legalName}
        {c.registrationNo ? ` (registration ${c.registrationNo})` : ""}, {c.address}. Email: {c.supportEmail}. Phone: {c.phone}.
      </p>
    </LegalPage>
  );
}
