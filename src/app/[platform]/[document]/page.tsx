import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DocumentText } from "@/components/DocumentText.tsx";
import { ExternalLink } from "@/components/ExternalLink.tsx";
import { Docket } from "@/components/Record.tsx";
import { SubscribeForm } from "@/components/SubscribeForm.tsx";
import { audienceLabel, documentKey, findDocument } from "@/core/platforms.ts";
import { getDocumentFacts, getHistory, getLatestText, getStatuses } from "@/lib/data.ts";
import { describeOutcome, formatDay, formatDayTime, possessive } from "@/lib/format.ts";
import { pageMetadata } from "@/lib/meta.ts";
import { getDocument, getPlatforms } from "@/lib/registry.ts";
import { breadcrumbs, documentEntity, JsonLd, webPage } from "@/lib/structured-data.tsx";

export async function generateMetadata({ params }: PageProps<"/[platform]/[document]">): Promise<Metadata> {
  const { platform, document } = await params;
  const found = await getDocument(platform, document);
  if (!found) return {};
  const latest = (await getDocumentFacts())[documentKey(platform, document)]?.latest;
  return pageMetadata({
    title: `${found.platform.name} ${found.document.title}`,
    description: documentDescription(found.platform.name, found.document.title, latest),
    path: `/${platform}/${document}`,
  });
}

/** For search results: under 160 characters, with the date of the last change when it fits. */
function documentDescription(platform: string, title: string, latest: { capturedAt: string; isFirst: boolean } | undefined) {
  const base = `The current text of ${possessive(platform)} ${title} and every recorded change, each shown as a redline.`;
  const when = latest ? ` ${latest.isFirst ? "First recorded" : "Last changed"} ${formatDay(latest.capturedAt)}.` : "";
  return (base + when).length <= 160 ? base + when : base;
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
  // Documents captured by hand aren't checked by the crawler; its last attempt isn't shown.
  const status = document.mode === "auto" ? statuses[documentKey(platform.slug, document.slug)] : undefined;
  const outcome = status ? describeOutcome(status.lastOutcome) : null;

  const path = `/${platform.slug}/${document.slug}`;
  const newest = facts[documentKey(platform.slug, document.slug)]?.latest;

  return (
    <>
      <JsonLd
        data={[
          webPage({
            path,
            name: `${platform.name} ${document.title}`,
            description: documentDescription(platform.name, document.title, newest),
            dateModified: newest?.capturedAt,
            about: documentEntity(platform, document),
          }),
          breadcrumbs([
            { name: platform.name, path: `/${platform.slug}` },
            { name: document.title, path },
          ]),
        ]}
      />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/#platforms">All platforms</Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/${platform.slug}`}>{platform.name}</Link>
      </nav>
      <p className="eyebrow">
        {platform.kind} · {audienceLabel[document.audience]}
      </p>
      <h1>
        {platform.name} {document.title}
      </h1>

      <dl className="facts">
        <dt>Published at</dt>
        <dd>
          {document.url ? (
            <ExternalLink href={document.url} rel="nofollow">
              {document.url.replace(/^https:\/\//, "")}
            </ExternalLink>
          ) : (
            "We are still confirming the public address of this document."
          )}
        </dd>
        <dt>How we capture it</dt>
        <dd>{document.mode === "auto" ? "Checked automatically twice a day." : document.manualReason}</dd>
        <dt>{document.mode === "auto" ? "Last checked" : "Last captured"}</dt>
        <dd>
          {document.mode === "manual" ? (
            latest ? (
              `${formatDay(latest.capturedAt)}. Captured only when an editor saves a fresh copy, so it can lag behind the live page.`
            ) : (
              "Not yet"
            )
          ) : status ? (
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

      <SubscribeForm platformSlug={platform.slug} platformName={platform.name} page={`/${platform.slug}/${document.slug}`} />

      <section className="section" aria-labelledby="history-title">
        <div className="section-head">
          <h2 id="history-title">History</h2>
        </div>
        {history.length === 0 ? (
          <p className="empty">
            {document.mode === "manual"
              ? "We haven’t captured this document yet. "
              : "Nothing recorded yet. The first automatic check will save the current text. "}
            If {platform.name} showed it to you, <Link href="/submit">share it privately</Link>.
          </p>
        ) : (
          <Docket versions={history} showDocument={false} platforms={platforms} />
        )}
      </section>

      {latest && (
        <section className="section" aria-labelledby="text-title">
          <div className="section-head">
            <h2 id="text-title">Current text</h2>
            <span className="mono">
              {latest.method === "archive" ? "First archived" : "Captured"} {formatDay(latest.capturedAt)}
              {latest.method === "auto" || latest.method === "archive"
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
