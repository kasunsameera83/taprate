import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { canPerform } from "@/lib/security/authz";
import { isUuid } from "@/lib/security/signing";
import { formatMoney, type Currency } from "@/lib/billing/catalog";
import { PrintButton } from "./PrintButton";

// A printable receipt ("Save as PDF" from the print dialog). Owner only; read through the user's own
// session, so the database's owner-only rule applies too.
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, active } = await requirePageSession({ needAccount: true });
  if (!canPerform(active!.role, "billing:manage")) notFound();

  const [{ data: p }, { data: profile }, { data: account }] = await Promise.all([
    supabase.from("billing_payments").select("receipt_no, description, amount_minor, currency, status, paid_at, refunded_at, provider").eq("id", id).eq("account_id", active!.accountId).maybeSingle(),
    supabase.from("billing_profiles").select("first_name, last_name, email, address, city, country, company, tax_id").eq("account_id", active!.accountId).maybeSingle(),
    supabase.from("accounts").select("name").eq("id", active!.accountId).maybeSingle(),
  ]);
  if (!p) notFound();
  const money = formatMoney(Number(p.amount_minor), p.currency as Currency);
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 print:hidden">
        <Link href="/app/settings/billing" className="btn btn-ghost">
          Back
        </Link>
        <PrintButton />
      </div>
      <article className="print-area panel space-y-6 p-6 sm:p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-bold">TapRate</p>
            <p className="text-sm text-muted">Receipt</p>
          </div>
          <dl className="text-right text-sm">
            <dt className="text-muted">Receipt number</dt>
            <dd className="font-semibold">{p.receipt_no}</dd>
            <dt className="mt-1 text-muted">Date paid</dt>
            <dd className="font-semibold">{date(p.paid_at)}</dd>
          </dl>
        </header>
        <section className="text-sm">
          <h2 className="font-semibold">Billed to</h2>
          <p>
            {profile?.company || account?.name}
            <br />
            {profile ? `${profile.first_name} ${profile.last_name}` : null}
            {profile && (
              <>
                <br />
                {profile.address}, {profile.city}, {profile.country}
                <br />
                {profile.email}
              </>
            )}
            {profile?.tax_id && (
              <>
                <br />
                Tax / VAT: {profile.tax_id}
              </>
            )}
          </p>
        </section>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 font-semibold">Description</th>
              <th scope="col" className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-2">{p.description}</td>
              <td className="py-2 text-right">{money}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="py-2">Total paid ({p.currency})</th>
              <td className="py-2 text-right font-bold">{money}</td>
            </tr>
          </tfoot>
        </table>
        <p className="text-[13px] text-muted">
          Paid via {p.provider === "payhere" ? "PayHere" : "Stripe"}.
          {p.status === "refunded" && p.refunded_at ? ` Refunded on ${date(p.refunded_at)}.` : ""}
        </p>
      </article>
    </div>
  );
}
