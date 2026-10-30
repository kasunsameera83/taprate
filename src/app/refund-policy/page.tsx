import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/LegalPage";
import { COMPANY } from "@/lib/site/company";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "When TapTruly refunds a payment, how to ask, and how long it takes. Refunds go back to the card or account you paid with.",
  alternates: { canonical: "/refund-policy" },
};

// Plain-English refund policy (also required by PayHere and the card networks). Have it reviewed with the Terms.
export default function RefundPolicyPage() {
  const c = COMPANY;
  return (
    <LegalPage title="Refund Policy">
      <p>
        This policy explains when {c.legalName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) refunds payments for {c.productName}, and how. {c.productName} is an online service
        (software), so there is nothing to ship or return: refunds are about the plans and response top-ups you buy.
      </p>

      <h2>1. Refunds go back to how you paid</h2>
      <p>
        <strong>
          Every refund is paid back to the same payment method you used for the original payment
        </strong>{" "}
        (the same card, bank account or mobile wallet, through PayHere or Stripe). We don&rsquo;t refund in cash, by bank transfer to a different account, or to a
        different card.
      </p>

      <h2>2. Start free, so you can try before you pay</h2>
      <p>
        Every new business gets free responses and no card is needed, so you can try {c.productName} with real customers before paying anything.
      </p>

      <h2>3. When you can get a refund</h2>
      <ul>
        <li>
          <strong>Your first payment for a plan:</strong> if {c.productName} isn&rsquo;t right for you, ask within <strong>7 days</strong> of that first payment and we&rsquo;ll
          refund it in full.
        </li>
        <li>
          <strong>Response top-ups:</strong> ask within <strong>7 days</strong> of buying, and we&rsquo;ll refund it in full if none of the top-up&rsquo;s responses have
          been used.
        </li>
        <li>
          <strong>Mistakes on our side:</strong> if you were charged twice, charged the wrong amount, or charged after you cancelled, we&rsquo;ll refund the extra amount in
          full, whenever you tell us.
        </li>
        <li>
          <strong>Service problems:</strong> if {c.productName} was unavailable for a long time because of a fault on our side, tell us and we&rsquo;ll refund or credit a
          fair part of that period.
        </li>
      </ul>

      <h2>4. When we don&rsquo;t refund</h2>
      <ul>
        <li>Renewals (the second and later payments of a plan) after the period has started. You can cancel at any time so the next renewal doesn&rsquo;t happen.</li>
        <li>The unused part of a monthly or yearly period after you cancel. Your plan keeps working until the end of the period you paid for.</li>
        <li>Top-ups whose responses have been partly or fully used.</li>
        <li>Accounts suspended for breaking our <Link href="/terms" className="link">Terms of Service</Link> (for example sending spam).</li>
      </ul>
      <p>None of this takes away any refund rights you have under the law.</p>

      <h2>5. Cancelling</h2>
      <p>
        You can cancel a plan at any time in <strong>Settings → Billing</strong>. You won&rsquo;t be charged again, and the plan stays active until the end of the period you
        paid for. Responses you&rsquo;ve already received stay in your account.
      </p>

      <h2>6. How to ask for a refund</h2>
      <p>
        Email <a className="link" href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a> from the email address on your account, with your business name, the payment date
        and amount (or the order number from your receipt), and the reason. We reply within 2 working days.
      </p>

      <h2>7. How long it takes</h2>
      <p>
        Once we approve a refund we send it to your original payment method within 5 working days. Your bank or card provider may then take another 5 to 14 working days
        to show it on your statement, depending on their own processing times.
      </p>

      <h2>8. What happens to your account</h2>
      <p>
        When a plan payment is refunded, the plan ends and its responses are removed from your balance; your business moves to the free plan. When a top-up is refunded,
        its responses are removed. Your surveys, ratings and comments are not deleted.
      </p>

      <h2>9. Currency</h2>
      <p>
        Refunds are made in the currency you paid in: Sri Lankan rupees (LKR) or US dollars (USD). If your bank converted the payment, the amount you get back can differ
        slightly because of exchange rates or bank fees, which we don&rsquo;t control.
      </p>

      <h2>10. Contact</h2>
      <p>
        {c.legalName}
        {c.registrationNo ? ` (registration ${c.registrationNo})` : ""}, {c.address}. Email: {c.supportEmail}
        {c.phone ? `. Phone: ${c.phone}` : ""}.
      </p>
    </LegalPage>
  );
}
