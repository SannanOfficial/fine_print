import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { contactEmail } from "@/core/site.ts";
import { getPlatforms } from "@/lib/registry.ts";
import { SubmitForm } from "./SubmitForm.tsx";

export const metadata: Metadata = {
  title: "Share an agreement privately",
  description:
    "Send Fine Print terms or policy updates a platform showed you privately, by email, in its app or as a contract. Your details stay private.",
};

export default function SubmitPage() {
  return (
    <article>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
      </nav>
      <h1>Share an agreement privately</h1>
      <p className="lede" style={{ marginTop: "1rem" }}>
        Many changes never appear on a public page. They arrive in an email, an in-app notice or a contract to sign.
        If a platform showed you new terms or a policy update, send it here. Your copy may be the only evidence that
        those terms were ever offered, and it helps every clinician see where the platform is heading.
      </p>

      <div className="prose submit-intro">
        <h2>What happens next</h2>
        <ol className="plain-steps">
          <li>Your submission is encrypted as soon as it arrives. Only Fine Print&rsquo;s editors can open it.</li>
          <li>An editor contacts you, usually within a week, to confirm where it came from and when you received it.</li>
          <li>
            Once confirmed, the text can be added to the public record. Your name, contact details and anything that
            identifies you are never published.
          </li>
        </ol>
        <p className="note">
          Please don&rsquo;t send anything containing patient information. If you are unsure whether sharing an
          agreement is allowed under your contract, check before you send it. Fine Print is not legal advice.
        </p>
      </div>

      <Suspense fallback={<p className="empty">Loading the form…</p>}>
        <LiveForm />
      </Suspense>
    </article>
  );
}

async function LiveForm() {
  await connection();
  const platforms = await getPlatforms();
  return <SubmitForm platforms={platforms.map((p) => ({ slug: p.slug, name: p.name }))} contact={contactEmail()} />;
}
