import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";
import { COMPANY, SUBPROCESSORS } from "@/lib/site/company";

export const metadata: Metadata = { title: "Privacy Policy" };

// A plain-English starting point written with Sri Lanka's Personal Data Protection Act (No. 9 of 2022)
// in mind. Have it reviewed by a lawyer before launch.
export default function PrivacyPage() {
  const c = COMPANY;
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what personal information {c.legalName} (&ldquo;we&rdquo;) handles when you use {c.productName}, why, and your rights. Questions:{" "}
        {c.privacyEmail}.
      </p>

      <h2>Two kinds of information</h2>
      <ul>
        <li>
          <strong>Account information</strong> about the people who use {c.productName} (business owners and their teams). For this we are the <em>controller</em>.
        </li>
        <li>
          <strong>Feedback information</strong> that businesses collect from their own customers through {c.productName}: ratings, comments and, if the business adds
          them, the customer&rsquo;s email, the agent&rsquo;s name and a ticket number. For this the business is the controller and we are its <em>processor</em>: we use
          it only to provide the service to that business. If you rated a business and have a question, please contact that business.
        </li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email, business name, team roles, and your settings.</li>
        <li>Billing details: billing name, address, phone and company details. Card details are handled by PayHere or Stripe; we never see or store full card numbers.</li>
        <li>Feedback: ratings, comments, selected reasons, and the details a business includes in its links.</li>
        <li>
          Security and technical data: sign-in events, a record of important account changes, and a one-way scrambled (hashed) version of IP addresses used for spam and
          abuse protection. We don&rsquo;t store raw IP addresses for ratings.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide {c.productName}: collecting ratings, showing reports, sending alerts and reports you ask for (performing our contract with you).</li>
        <li>To keep the service secure and stop fraud, spam and fake ratings (our legitimate interest).</li>
        <li>To take payments and keep financial records (legal obligation and contract).</li>
        <li>To tell you about important changes to the service. We don&rsquo;t sell personal information, and we don&rsquo;t use it for advertising.</li>
      </ul>

      <h2>AI summaries</h2>
      <p>
        Only if a business owner turns them on: comments are sent to Anthropic (Claude) to create a summary for that business, with email addresses and phone numbers
        removed first. Anthropic doesn&rsquo;t use this data to train its models.
      </p>

      <h2>Who we share it with</h2>
      <p>We use these service providers, under contracts that require them to protect the data:</p>
      <ul>
        {SUBPROCESSORS.map((s) => (
          <li key={s.name}>
            <strong>{s.name}</strong>: {s.purpose} ({s.location})
          </li>
        ))}
      </ul>
      <p>
        Some providers are outside Sri Lanka. Where data is transferred abroad, we rely on the safeguards required by law. We may also share information if the law
        requires it.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account and feedback data: while the account is open. Owners can delete a customer&rsquo;s data, or the whole account, at any time from Settings.</li>
        <li>Unconfirmed clicks (for example from email scanners): deleted after 30 days.</li>
        <li>Billing records: as long as tax law requires (usually up to 7 years).</li>
        <li>Backups are overwritten on a rolling basis, so deleted data disappears from them within about 30 days.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit, every business&rsquo;s data is kept separate by database rules, sensitive keys are stored encrypted, and team members can protect
        their accounts with two-step verification.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to access, correct or delete your personal information, object to or limit how we use it, or withdraw consent where we rely on it. Email{" "}
        {c.privacyEmail}; we reply within one month. If you&rsquo;re not happy with our answer, you can complain to the Data Protection Authority of Sri Lanka.
      </p>

      <h2>Cookies</h2>
      <p>
        We only use cookies needed to keep you signed in and secure, and to remember which business you&rsquo;re working in. We don&rsquo;t use advertising or tracking
        cookies. The website may remember in your browser that you&rsquo;ve closed a promotion.
      </p>

      <h2>Changes</h2>
      <p>We&rsquo;ll post changes here and tell account owners about important ones.</p>

      <h2>Contact</h2>
      <p>
        {c.legalName}, {c.address}. Privacy questions: {c.privacyEmail}. Phone: {c.phone}.
      </p>
    </LegalPage>
  );
}
