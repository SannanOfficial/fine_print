import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DocumentText } from "@/components/DocumentText.tsx";
import { Redline, RedlineLegend } from "@/components/Redline.tsx";
import { SummaryBox } from "@/components/Summary.tsx";
import { diffDocuments } from "@/core/diff.ts";
import type { Platform, TrackedDocument } from "@/core/platforms.ts";
import type { CaptureMethod } from "@/core/records.ts";
import { getVersionPair } from "@/lib/data.ts";
import { describeStats, formatDay, formatDayTime } from "@/lib/format.ts";
import { getDocument } from "@/lib/registry.ts";

const CAPTURED: Record<CaptureMethod, string> = {
  auto: "Automatically, from the public page",
  manual: "By hand, by a Fine Print editor",
  submission: "Shared privately by a clinician and confirmed by a Fine Print editor",
};

export async function generateMetadata({ params }: PageProps<"/[platform]/[document]/[version]">): Promise<Metadata> {
  const { platform, document } = await params;
  const found = await getDocument(platform, document);
  if (!found) return {};
  return {
    title: `Change to ${found.platform.name} ${found.document.title}`,
    description: `What changed in ${found.platform.name}'s ${found.document.title}, shown as a redline.`,
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
  const pair = await getVersionPair(platform.slug, document.slug, id);
  if (!pair) notFound();
  const { version, previous } = pair;
  const entries = previous ? diffDocuments(previous.content, version.content) : [];
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
      <h1>{previous ? `Changed ${formatDay(version.capturedAt)}` : `First copy, ${formatDay(version.capturedAt)}`}</h1>

      <dl className="facts">
        <dt>Recorded</dt>
        <dd>{formatDayTime(version.capturedAt)}</dd>
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
    </>
  );
}
