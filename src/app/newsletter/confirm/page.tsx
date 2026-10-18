import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { readToken } from "@/core/newsletter-links.ts";
import { getPlatform } from "@/lib/registry.ts";
import { ConfirmForm } from "../forms.tsx";

export const metadata: Metadata = { title: "Confirm your subscription", robots: { index: false, follow: false } };

export default function ConfirmPage({ searchParams }: PageProps<"/newsletter/confirm">) {
  return (
    <article className="narrow">
      <Suspense fallback={<p className="empty">Loading…</p>}>
        {searchParams.then((q) => (
          <Confirm token={typeof q.t === "string" ? q.t : ""} />
        ))}
      </Suspense>
    </article>
  );
}

async function Confirm({ token }: { token: string }) {
  await connection();
  const link = readToken(token);
  const platform = link?.k === "confirm" ? await getPlatform(link.p) : undefined;
  if (link?.k === "confirm" && !platform) {
    return (
      <>
        <h1>This platform is no longer tracked</h1>
        <p className="lede" style={{ marginTop: "1rem" }}>
          Fine Print stopped tracking it, so there is nothing to confirm. Nothing has been sent and nothing more will be.
        </p>
        <p className="note">
          <Link href="/#platforms">See the platforms we track</Link>
        </p>
      </>
    );
  }
  if (link?.k !== "confirm" || !platform) {
    return (
      <>
        <h1>This link has expired or isn&rsquo;t complete</h1>
        <p className="lede" style={{ marginTop: "1rem" }}>
          Confirmation links work for 7 days, and some email apps cut long links short. Sign up again from the
          platform&rsquo;s page and we&rsquo;ll send a new one.
        </p>
        <p className="note">
          <Link href="/#platforms">All platforms</Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h1>Confirm your subscription</h1>
      <p className="lede" style={{ marginTop: "1rem" }}>
        You&rsquo;ll get an email on Monday in any week that <Link href={`/${platform.slug}`}>{platform.name}</Link>{" "}
        changes the terms it asks clinicians to accept, with a summary of each change and a link to the exact redline.
      </p>
      <ConfirmForm token={token} />
    </>
  );
}
