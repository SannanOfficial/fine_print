import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DocumentText } from "@/components/DocumentText.tsx";
import { Docket } from "@/components/Record.tsx";
import { SubscribeForm } from "@/components/SubscribeForm.tsx";
import { audienceLabel, documentKey, findDocument } from "@/core/platforms.ts";
import { getDocumentFacts, getHistory, getLatestText, getStatuses } from "@/lib/data.ts";
import { describeOutcome, formatDay, formatDayTime } from "@/lib/format.ts";
import { getDocument, getPlatforms } from "@/lib/registry.ts";

export async function generateMetadata({ params }: PageProps<"/[platform]/[document]">): Promise<Metadata> {
  const { platform, document } = await params;
  const found = await getDocument(platform, document);
  if (!found) return {};
  return {
    title: `${found.platform.name} ${found.document.title}`,
    description: `The current text of ${found.platform.name}'s ${found.document.title} and every recorded change to it.`,
  };
}

export default function DocumentPage({ params }: PageProps<"/[platform]/[document]">) {
  return (
    <Suspense fallback={<p className="empty">Loading the record…</p>}>
      {params.then(({ platform, document }) => (
        <DocumentView platformSlug={platform} documentSlug={document} />
      ))}
    </Suspense>
  );
}

async function DocumentView({ platformSlug, documentSlug }: { platformSlug: string; documentSlug: string }) {
  await connection();
  const [platforms, statuses, history, latest, facts] = await Promise.all([
    getPlatforms(),
    getStatuses(),
    getHistory(platformSlug, documentSlug),
    getLatestText(platformSlug, documentSlug),
    getDocumentFacts(),
  ]);
  const found = findDocument(platforms, platformSlug, documentSlug);
  if (!found) notFound();
  const { platform, document } = found;
  const status = statuses[documentKey(platform.slug, document.slug)];
  const outcome = status ? describeOutcome(status.lastOutcome) : null;

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/#platforms">All platforms</Link> / <Link href={`/${platform.slug}`}>{platform.name}</Link>
      </nav>
      <p className="eyebrow">
        {platform.name} · {audienceLabel[document.audience]}
      </p>
      <h1>{document.title}</h1>

      <dl className="facts">
        <dt>Published at</dt>
        <dd>
          {document.url ? (
            <a href={document.url} rel="noopener noreferrer nofollow">
              {document.url.replace(/^https:\/\//, "")}
            </a>
          ) : (
            "We are still confirming the public address of this document."
          )}
        </dd>
        <dt>How we capture it</dt>
        <dd>{document.mode === "auto" ? "Checked automatically twice a day." : document.manualReason}</dd>
        <dt>Last checked</dt>
        <dd>
          {status ? (
            <>
              {formatDayTime(status.lastCheckedAt)}
              {outcome && !outcome.ok && (
                <>
                  <span className="status-warn"> · {outcome.text}</span>
                  {status.lastSuccessAt && (
                    <span className="index-kind">
                      {" "}
                      · Last successful check {formatDayTime(status.lastSuccessAt)}; the text below may be out of date.
                    </span>
                  )}
                </>
              )}
            </>
          ) : (
            "Not yet"
          )}
        </dd>
        <dt>Versions on record</dt>
        <dd>{facts[documentKey(platformSlug, documentSlug)]?.count ?? 0}</dd>
      </dl>

      <SubscribeForm platformSlug={platform.slug} platformName={platform.name} />

      <section className="section" aria-labelledby="history-title">
        <div className="section-head">
          <h2 id="history-title">History</h2>
        </div>
        {history.length === 0 ? (
          <p className="empty">No copies of this document have been recorded yet.</p>
        ) : (
          <Docket versions={history} showDocument={false} platforms={platforms} />
        )}
      </section>

      {latest && (
        <section className="section" aria-labelledby="text-title">
          <div className="section-head">
            <h2 id="text-title">Current text</h2>
            <span className="mono">
              Captured {formatDay(latest.capturedAt)}
              {latest.method === "auto"
                ? ` · still published ${formatDay(latest.lastSeenAt)}`
                : latest.method === "submission"
                  ? " · shared by a clinician"
                  : " · captured by hand"}
            </span>
          </div>
          <div className="sheet">
            <DocumentText content={latest.content} />
          </div>
        </section>
      )}
    </>
  );
}
