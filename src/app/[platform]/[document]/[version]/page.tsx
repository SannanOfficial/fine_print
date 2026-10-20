import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DocumentText } from "@/components/DocumentText.tsx";
import { ExternalLink } from "@/components/ExternalLink.tsx";
import { Redline, RedlineLegend } from "@/components/Redline.tsx";
import { SubscribeForm } from "@/components/SubscribeForm.tsx";
import { SummaryBox } from "@/components/Summary.tsx";
import { contactEmail } from "@/core/site.ts";
import type { Platform, TrackedDocument } from "@/core/platforms.ts";
import type { CaptureMethod } from "@/core/records.ts";
import { getNextVersion, getRedline, getVersionPair, type VersionText } from "@/lib/data.ts";
import { describeStats, formatDay, formatDayTime, possessive } from "@/lib/format.ts";
import { pageMetadata } from "@/lib/meta.ts";
import { getDocument } from "@/lib/registry.ts";
import { breadcrumbs, documentEntity, JsonLd, webPage } from "@/lib/structured-data.tsx";

const CAPTURED: Record<CaptureMethod, string> = {
  auto: "Automatically, from the public page",
  manual: "By hand, by a Fine Print editor",
  submission: "Shared privately by a clinician and confirmed by a Fine Print editor",
  archive: "From the Internet Archive's copy of the public page, added to the record later",
};

export async function generateMetadata({ params }: PageProps<"/[platform]/[document]/[version]">): Promise<Metadata> {
  const { platform, document, version } = await params;
  const [found, pair, next] = await Promise.all([
    getDocument(platform, document),
    getVersionPair(platform, document, version),
    getNextVersion(platform, document, version),
  ]);
  if (!found) return {};
  if (!pair) return { title: `Change to ${found.platform.name} ${found.document.title}` };
  const { title, description } = describeVersion(found.platform, found.document, pair, next);
  return pageMetadata({
    title,
    description,
    path: `/${platform}/${document}/${version}`,
    article: { publishedTime: pair.version.capturedAt, section: found.platform.name },
  });
}

/**
 * Each version gets its own title, heading and description, so shared links
 * and search results are distinguishable. When another version was recorded
 * the same day, the time tells them apart.
 */
function describeVersion(
  platform: Platform,
  document: TrackedDocument,
  pair: { version: VersionText; previous: VersionText | null },
  next: { capturedAt: string } | null,
) {
  const name = `${platform.name} ${document.title}`;
  const { version: v, previous } = pair;
  const sameDay = [previous?.capturedAt, next?.capturedAt].some((d) => d && formatDay(d) === formatDay(v.capturedAt));
  const day = v.datedOn ? formatDay(`${v.datedOn}T00:00:00Z`) : sameDay ? formatDayTime(v.capturedAt) : formatDay(v.capturedAt);
  const heading = v.datedOn ? `${previous ? "Change" : "First copy,"} dated ${day}` : previous ? `Changed ${day}` : `First copy, ${day}`;
  if (!previous) {
    return {
      day,
      heading,
      title: `${name}: first copy, ${day}`,
      description: `The first copy of ${possessive(platform.name)} ${document.title} on the record, captured ${day}, word for word.`,
    };
  }
  // Link previews show the description as fact, so an AI draft no editor has checked says so.
  const s = v.summary;
  const gist = !s ? describeStats(v.stats) : s.byAi && !s.reviewed ? `AI summary, not yet checked: ${s.headline}` : s.headline;
  // Search results show about 160 characters: the gist first, then context if it fits.
  const sentence = `${gist.replace(/\.$/, "")}.`;
  const before = formatDay(previous.capturedAt) === formatDay(v.capturedAt) ? formatDayTime(previous.capturedAt) : formatDay(previous.capturedAt);
  const full = `${sentence} Redline of ${possessive(platform.name)} ${document.title} against the version of ${before}.`;
  const description = full.length <= 160 ? full : sentence.length <= 160 ? sentence : `${sentence.slice(0, 157).replace(/\s+\S*$/, "")}…`;
  return { day, heading, title: `${name}: change of ${day}`, description };
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
  const path = `/${platform.slug}/${document.slug}/${id}`;
  const described = describeVersion(platform, document, pair, next);

  return (
    <>
      <JsonLd
        data={[
          webPage({
            path,
            name: described.title,
            description: described.description,
            datePublished: version.capturedAt,
            about: documentEntity(platform, document),
          }),
          breadcrumbs([
            { name: platform.name, path: `/${platform.slug}` },
            { name: document.title, path: `/${platform.slug}/${document.slug}` },
            { name: previous ? `Change of ${described.day}` : `First copy, ${described.day}`, path },
          ]),
        ]}
      />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/#platforms">All platforms</Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/${platform.slug}`}>{platform.name}</Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/${platform.slug}/${document.slug}`}>{document.title}</Link>
      </nav>
      {/* The document's name is part of the heading, so each redline's heading is its own. */}
      <h1>
        <span className="h1-kicker">
          {platform.name} {document.title}
        </span>{" "}
        {described.heading}
      </h1>

      {!next && (
        <p className="note superseded is-current">
          This is the latest version on the record
          {version.method === "auto" || version.method === "archive"
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
        {/* An archived version wasn't recorded by us then; the date is when the Internet Archive first saw it. */}
        <dt>{version.method === "archive" ? "First archived" : "Recorded on"}</dt>
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
                The version recorded {formatDay(previous.capturedAt)}
              </Link>
            </dd>
            <dt>How much changed</dt>
            <dd>{describeStats(version.stats)}</dd>
          </>
        )}
        <dt>How it was captured</dt>
        <dd>{CAPTURED[version.method]}</dd>
        <dt>Source</dt>
        <dd>
          {version.sourceUrl ? (
            <ExternalLink href={version.sourceUrl} rel="nofollow">
              {version.sourceUrl.replace(/^https:\/\//, "")}
            </ExternalLink>
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

      <SubscribeForm platformSlug={platform.slug} platformName={platform.name} page={`/${platform.slug}/${document.slug}/${id}`} />
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
