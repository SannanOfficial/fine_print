import type { Metadata } from "next";
import { ObjectId } from "mongodb";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { readToken } from "@/core/newsletter-links.ts";
import { COLLECTIONS, type SubscriberRecord } from "@/core/records.ts";
import { unseal } from "@/core/seal.ts";
import { getDb } from "@/lib/db.ts";
import { getPlatforms } from "@/lib/registry.ts";
import { PreferencesForm } from "../forms.tsx";

export const metadata: Metadata = { title: "Your email updates", robots: { index: false, follow: false } };

export default function ManagePage({ searchParams }: PageProps<"/newsletter/manage">) {
  return (
    <article className="narrow">
      <Suspense fallback={<p className="empty">Loading…</p>}>
        {searchParams.then((q) =>
          q.left === "1" ? (
            <>
              <h1>You&rsquo;re unsubscribed</h1>
              <p className="lede" style={{ marginTop: "1rem" }}>
                No more emails will be sent, and your address has been deleted from Fine Print. To sign up again, use
                the form on the <Link href="/">home page</Link> or any platform&rsquo;s page.
              </p>
            </>
          ) : (
            <Manage token={typeof q.t === "string" ? q.t : ""} />
          ),
        )}
      </Suspense>
    </article>
  );
}

async function Manage({ token }: { token: string }) {
  await connection();
  const link = readToken(token);
  const subscriber =
    link?.k === "manage"
      ? await (await getDb())
          .collection<SubscriberRecord>(COLLECTIONS.subscribers)
          .findOne({ _id: new ObjectId(link.s), tokenVersion: link.v })
      : null;
  if (!subscriber) {
    return (
      <>
        <h1>Nothing to manage</h1>
        <p className="lede" style={{ marginTop: "1rem" }}>
          This link isn&rsquo;t valid any more, or the address has already been unsubscribed. To sign up again, use the
          form on the <Link href="/">home page</Link> or any platform&rsquo;s page.
        </p>
      </>
    );
  }
  const email = unseal(subscriber.email, `subscriber:${subscriber._id.toHexString()}`).toString("utf8");
  const platforms = await getPlatforms();
  return (
    <>
      <h1>Your email updates</h1>
      <p className="lede" style={{ marginTop: "1rem" }}>
        Monday emails to <b>{email}</b>, sent only in weeks when a platform you follow changes its terms.
      </p>
      <PreferencesForm
        token={token}
        platforms={platforms.map((p) => ({ slug: p.slug, name: p.name, kind: p.kind }))}
        chosen={subscriber.allPlatforms ? platforms.map((p) => p.slug) : subscriber.platforms}
      />
    </>
  );
}
