import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ExternalLink } from "@/components/ExternalLink.tsx";
import { StatusLine } from "@/components/Record.tsx";
import { SubscribeForm } from "@/components/SubscribeForm.tsx";
import { RecordTimeline, StandingPanel } from "@/components/Timeline.tsx";
import { audienceLabel, documentKey } from "@/core/platforms.ts";
import { getDocumentFacts, getEvents, getHistory, getStatuses } from "@/lib/data.ts";
import { pageMetadata } from "@/lib/meta.ts";
import { getPlatform, getPlatforms } from "@/lib/registry.ts";
import { breadcrumbs, JsonLd, platformEntity, webPage } from "@/lib/structured-data.tsx";
import { buildTimeline, standingOf } from "@/lib/timeline.ts";

export async function generateMetadata({ params }: PageProps<"/[platform]">): Promise<Metadata> {
  const platform = await getPlatform((await params).platform);
  if (!platform) return {};
  return pageMetadata({
    title: `${platform.name} terms of service and changes`,
    description: platformDescription(platform),
    path: `/${platform.slug}`,
  });
}

/** For search results: under 160 characters, with what the platform is when it fits. */
function platformDescription(platform: { name: string; kind: string }) {
  const base = `Every version of the terms ${platform.name} asks clinicians to accept, word for word, with each change dated and shown as a redline.`;
  const withKind = `${platform.kind}. ${base}`;
  return withKind.length <= 160 ? withKind : base;
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
  const [platforms, statuses, history, facts, events] = await Promise.all([
    getPlatforms(),
    getStatuses(),
    getHistory(slug),
    getDocumentFacts(),
    getEvents(slug),
  ]);
  const platform = platforms.find((p) => p.slug === slug);
  if (!platform) notFound();
  const timeline = buildTimeline(platform, history, events);
  const standing = standingOf(platform, timeline);

  const path = `/${platform.slug}`;
  const lastChange = platform.documents
    .map((d) => facts[documentKey(platform.slug, d.slug)]?.latest.capturedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  return (
    <>
      <JsonLd
        data={[
          webPage({
            path,
            type: "CollectionPage",
            name: `${platform.name} terms of service and changes`,
            description: platformDescription(platform),
            dateModified: lastChange,
            about: platformEntity(platform),
          }),
          breadcrumbs([{ name: platform.name, path }]),
        ]}
      />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/#platforms">All platforms</Link>
      </nav>
      <p className="eyebrow">{platform.kind}</p>
      <h1>{platform.name}</h1>
      <p className="lede" style={{ marginTop: "0.75rem" }}>
        Every change {platform.name} has made to the terms it asks clinicians to accept, across all its documents, with
        the date and a plain-language summary of each. Read it to judge how the company treats the people who rely on it.
      </p>
      <p className="note" style={{ marginTop: "1rem" }}>
        Official site:{" "}
        <ExternalLink href={platform.website} rel="nofollow">
          {new URL(platform.website).hostname}
        </ExternalLink>
      </p>

      <StandingPanel standing={standing} name={platform.name} pdfHref={`/${platform.slug}/timeline.pdf`} />

      <section className="section" aria-labelledby="timeline-title">
        <div className="section-head">
          <h2 id="timeline-title">Timeline of changes</h2>
        </div>
        {timeline.length === 0 ? (
          <p className="empty">
            Nothing recorded for {platform.name} yet. If {platform.name} showed you new terms,{" "}
            <Link href="/submit">share them privately</Link>.
          </p>
        ) : (
          <>
            <p className="note timeline-note">
              Newest first. Each date is when the change happened as far as we know: the date on the document when it has
              one, otherwise the day we recorded it. Summaries may leave things out; the redline is the exact record.
            </p>
            <RecordTimeline items={timeline} />
          </>
        )}
      </section>

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

      <SubscribeForm platformSlug={platform.slug} platformName={platform.name} page={`/${platform.slug}`} />
    </>
  );
}
