import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { contactEmail } from "@/core/site.ts";

export const metadata: Metadata = { title: "Submission received", robots: { index: false, follow: false } };

/**
 * The receipt for a submission sent from a browser without JavaScript. (With
 * JavaScript, the form shows its own receipt and this page isn't used.)
 */
export default function ReceivedPage({ searchParams }: PageProps<"/submit/received">) {
  return (
    <article className="narrow">
      <Suspense fallback={<p className="empty">Loading…</p>}>
        {searchParams.then(({ ref }) => (
          <Receipt reference={typeof ref === "string" && /^FP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(ref) ? ref : null} />
        ))}
      </Suspense>
    </article>
  );
}

function Receipt({ reference }: { reference: string | null }) {
  const contact = contactEmail();
  return (
    <div className="receipt" role="status">
      <p className="receipt-label">Received</p>
      {reference && <p className="receipt-ref">{reference}</p>}
      <p>
        Thank you. {reference ? "Keep this reference. " : ""}We will contact you to confirm the details before anything
        is published, usually within a week. Nothing you sent is public.
      </p>
      <p>
        To withdraw or add to your submission, email{" "}
        <a href={`mailto:${contact}${reference ? `?subject=${encodeURIComponent(`Submission ${reference}`)}` : ""}`}>{contact}</a>
        {reference ? " and quote the reference above" : ""}.
      </p>
      <p className="note">
        <Link href="/">Back to Fine Print</Link>
      </p>
    </div>
  );
}
