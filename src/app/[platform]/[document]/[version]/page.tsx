import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DocumentText } from "@/components/DocumentText.tsx";
import { Redline, RedlineLegend } from "@/components/Redline.tsx";
import { SubscribeForm } from "@/components/SubscribeForm.tsx";
import { SummaryBox } from "@/components/Summary.tsx";
import { contactEmail } from "@/core/site.ts";
import type { Platform, TrackedDocument } from "@/core/platforms.ts";
import type { CaptureMethod } from "@/core/records.ts";
import { getNextVersion, getRedline, getVersionPair } from "@/lib/data.ts";
import { describeStats, formatDay, formatDayTime } from "@/lib/format.ts";
import { getDocument } from "@/lib/registry.ts";

const CAPTURED: Record<CaptureMethod, string> = {
  auto: "Automatically, from the public page",
  manual: "By hand, by a Fine Print editor",
  submission: "Shared privately by a clinician and confirmed by a Fine Print editor",
};

export async function generateMetadata({ params }: PageProps<"/[platform]/[document]/[version]">): Promise<Metadata> {
  const { platform, document, version } = await params;
  const [found, pair] = await Promise.all([getDocument(platform, document), getVersionPair(platform, document, version)]);
  if (!found) return {};
  const name = `${found.platform.name} ${found.document.title}`;
  // Each version gets its own title and description, so shared links are distinguishable.
  const canonical = `/${platform}/${document}/${version}`;
  if (!pair) return { title: `Change to ${name}`, description: `What changed in ${name}, shown as a redline.` };
  const { version: v, previous } = pair;
  const day = formatDay(v.datedOn ? `${v.datedOn}T00:00:00Z` : v.capturedAt);
  if (!previous) {
    return {
      title: `${name}: first copy, ${day}`,
      description: `The first copy of ${found.platform.name}'s ${found.document.title} on the record, captured ${day}.`,
      alternates: { canonical },
    };
  }
  return {
    title: `${name}: change of ${day}`,
    description: `${v.summary?.headline ?? describeStats(v.stats)}. Redline against the version of ${formatDay(previous.capturedAt)}.`,
    alternates: { canonical },
  };
}

export default function VersionPage({ params }: PageProps<"/[platform]/[document]/[version]">) {
  return (
    <Suspense fallback={<p className="empty">Loading this version…</p>}>
      {params.then(async ({ platform, document, version }) => {
        await connection();
        const found = await getDocument(platform, document);
        if (!found) notFound();
        return <VersionView platform={found.platform} document={found.document} id={version} />;
      })}
    </Suspense>
  );
}

async function VersionView({ platform, document, id }: { platform: Platform; document: TrackedDocument; id: string }) {
  await connection();
  const [pair, entries, next] = await Promise.all([
    getVersionPair(platform.slug, document.slug, id),
    getRedline(platform.slug, document.slug, id).then((e) => e ?? []),
    getNextVersion(platform.slug, document.slug, id),
  ]);
  if (!pair) notFound();
  const { version, previous } = pair;
  const visible = entries.some((e) => e.kind !== "same");

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/#platforms">All platforms</Link> / <Link href={`/${platform.slug}`}>{platform.name}</Link> /{" "}
        <Link href={`/${platform.slug}/${document.slug}`}>{document.title}</Link>
      </nav>
      <p className="eyebrow">
        {platform.name} · {document.title}
      </p>
      <h1>
        {version.datedOn
          ? `${previous ? "Changed" : "First copy,"} dated ${formatDay(`${version.datedOn}T00:00:00Z`)}`
          : previous
            ? `Changed ${formatDay(version.capturedAt)}`
            : `First copy, ${formatDay(version.capturedAt)}`}
      </h1>

      {!next && (
        <p className="note superseded is-current">
          This is the latest version on the record
          {version.method === "auto"
            ? `, last seen published ${formatDay(version.lastSeenAt)}`
            : version.method === "submission"
              ? ". It was shared privately by a clinician, so the public page may say something else"
              : ", recorded by hand"}
          . <Link href={`/${platform.slug}/${document.slug}`}>See the document&rsquo;s history</Link>.
        </p>
      )}
      {next && (
        <p className="note superseded">
          This isn&rsquo;t the current text.{" "}
          <Link href={`/${platform.slug}/${document.slug}/${next.id}`}>
            A newer version was recorded {formatDay(next.capturedAt)}
          </Link>
          , or <Link href={`/${platform.slug}/${document.slug}`}>read the current text</Link>.
        </p>
      )}

      <dl className="facts">
        <dt>Recorded</dt>
        <dd>{formatDayTime(version.capturedAt)}</dd>
        {version.datedOn && (
          <>
            <dt>Dated</dt>
            <dd>{formatDay(`${version.datedOn}T00:00:00Z`)}, according to the document or the email it came in</dd>
          </>
        )}
        {previous && (
          <>
            <dt>Compared with</dt>
            <dd>
              <Link href={`/${platform.slug}/${document.slug}/${previous.id}`}>
                The version captured {formatDay(previous.capturedAt)}
              </Link>
            </dd>
            <dt>Extent</dt>
            <dd>{describeStats(version.stats)}</dd>
          </>
        )}
        <dt>Captured</dt>
        <dd>{CAPTURED[version.method]}</dd>
        <dt>Source</dt>
        <dd>
          {version.sourceUrl ? (
            <a href={version.sourceUrl} rel="noopener noreferrer nofollow">
              {version.sourceUrl.replace(/^https:\/\//, "")}
            </a>
          ) : (
            "Not published on a public page"
          )}
        </dd>
      </dl>

      <section className="section" aria-labelledby="redline-title">
        {previous ? (
          <>
            {version.summary && <SummaryBox summary={version.summary} />}
            <div className="section-head">
              <h2 id="redline-title">What changed</h2>
            </div>
            <RedlineLegend />
            <div className="sheet">
              {visible ? (
                <Redline entries={entries} />
              ) : (
                <p className="empty">The wording is the same. Only formatting or link addresses changed.</p>
              )}
            </div>
            <details className="full-text">
              <summary>Read the full text of this version</summary>
              <div className="sheet">
                <DocumentText content={version.content} />
              </div>
            </details>
          </>
        ) : (
          <>
            <div className="section-head">
              <h2 id="redline-title">Full text</h2>
            </div>
            <p className="note" style={{ marginTop: "1rem" }}>
              This is the first copy we recorded, so there is nothing earlier to compare it with.
            </p>
            <div className="sheet">
              <DocumentText content={version.content} />
            </div>
          </>
        )}
      </section>

      <SubscribeForm platformSlug={platform.slug} platformName={platform.name} />
      <p className="note" style={{ marginTop: "1.5rem" }}>
        Spotted a mistake in this record, or have a newer copy of these terms?{" "}
        <Link href="/submit">Share it privately</Link>
        {contactEmail() && (
          <>
            {" "}
            or write to <a href={`mailto:${contactEmail()}`}>{contactEmail()}</a>
          </>
        )}
        .
      </p>
    </>
  );
}
