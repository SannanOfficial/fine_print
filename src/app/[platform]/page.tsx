import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Docket, StatusLine } from "@/components/Record.tsx";
import { SubscribeForm } from "@/components/SubscribeForm.tsx";
import { audienceLabel, documentKey } from "@/core/platforms.ts";
import { getDocumentFacts, getHistory, getStatuses } from "@/lib/data.ts";
import { getPlatform, getPlatforms } from "@/lib/registry.ts";

export async function generateMetadata({ params }: PageProps<"/[platform]">): Promise<Metadata> {
  const platform = await getPlatform((await params).platform);
  if (!platform) return {};
  return {
    title: platform.name,
    description: `Every recorded change to ${platform.name}'s published terms, with dates and redlines.`,
  };
}

export default function PlatformPage({ params }: PageProps<"/[platform]">) {
  return (
    <Suspense fallback={<p className="empty">Loading the record…</p>}>
      {params.then(({ platform }) => (
        <PlatformView slug={platform} />
      ))}
    </Suspense>
  );
}

async function PlatformView({ slug }: { slug: string }) {
  await connection();
  const [platforms, statuses, history, facts] = await Promise.all([getPlatforms(), getStatuses(), getHistory(slug), getDocumentFacts()]);
  const platform = platforms.find((p) => p.slug === slug);
  if (!platform) notFound();

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/#platforms">All platforms</Link>
      </nav>
      <p className="eyebrow">{platform.kind}</p>
      <h1>{platform.name}</h1>
      <p className="note" style={{ marginTop: "1rem" }}>
        Official site:{" "}
        <a href={platform.website} rel="noopener noreferrer nofollow">
          {new URL(platform.website).hostname}
        </a>
      </p>

      <SubscribeForm platformSlug={platform.slug} platformName={platform.name} />

      <section className="section" aria-labelledby="docs-title">
        <div className="section-head">
          <h2 id="docs-title">Documents we track</h2>
        </div>
        {platform.documents.length === 0 ? (
          <p className="empty">No documents from this platform are tracked yet.</p>
        ) : (
          <div className="cards">
            {platform.documents.map((d) => {
              const fact = facts[documentKey(platform.slug, d.slug)];
              const count = fact?.count ?? 0;
              return (
                <article key={d.slug} className="card">
                  <p className="eyebrow">{audienceLabel[d.audience]}</p>
                  <h3 style={{ margin: "0.35rem 0 0.5rem" }}>
                    <Link href={`/${platform.slug}/${d.slug}`}>{d.title}</Link>
                  </h3>
                  <StatusLine doc={d} status={statuses[documentKey(platform.slug, d.slug)]} latest={fact?.latest} />
                  {count > 0 && (
                    <p className="note" style={{ marginTop: "0.5rem" }}>
                      {count} {count === 1 ? "version" : "versions"} on record.
                    </p>
                  )}
                  {d.mode === "manual" && <p className="note">{d.manualReason}</p>}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="history-title">
        <div className="section-head">
          <h2 id="history-title">History</h2>
        </div>
        {history.length === 0 ? (
          <p className="empty">Nothing recorded for this platform yet.</p>
        ) : (
          <Docket versions={history} showDocument platforms={platforms} />
        )}
      </section>
    </>
  );
}
