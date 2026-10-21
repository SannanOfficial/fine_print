import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Fragment, Suspense } from "react";
import { ExternalLink } from "@/components/ExternalLink.tsx";
import { ClauseDrift, ClauseSpecimen, EmailVersusChanges, HowItWorks } from "@/components/Infographics.tsx";
import { Docket, StatusLine } from "@/components/Record.tsx";
import { SubscribeForm } from "@/components/SubscribeForm.tsx";
import { documentKey, findDocument, type Platform } from "@/core/platforms.ts";
import { EVERY_PLATFORM } from "@/core/newsletter-links.ts";
import { contactEmail, GITHUB_URL, PATREON_URL, SITE_DESCRIPTION } from "@/core/site.ts";
import { getDocumentFacts, getRecentChanges, getStatuses, type DocumentFacts, type PublicStatus } from "@/lib/data.ts";
import { FEED } from "@/lib/meta.ts";
import { getPlatforms } from "@/lib/registry.ts";
import { JsonLd, siteEntities, webPage } from "@/lib/structured-data.tsx";

export const metadata: Metadata = { alternates: { canonical: "/", types: FEED } };

export default function Home() {
  return (
    <>
      <JsonLd
        data={[
          ...siteEntities(),
          webPage({ path: "/", name: "Fine Print: a public record of healthcare platforms’ terms", description: SITE_DESCRIPTION }),
        ]}
      />
      <section className="hero">
        <p className="eyebrow">The public record of healthcare platforms&rsquo; terms of service</p>
        <h1>The fine print keeps moving.</h1>
        <p className="lede">
          Healthcare platforms keep rewriting the terms clinicians practice under, sometimes asking for rights to your
          name and voice, shorter notice or new limits on leaving. Fine Print keeps every version, word for word, and
          shows exactly what changed.
        </p>
        <SubscribeForm
          platformSlug={EVERY_PLATFORM}
          page="/"
          label="Get an email when a platform changes its terms"
          className="subscribe-hero"
        />
        <Suspense fallback={<p className="hero-tracking" aria-hidden="true" />}>
          <TrackedNames />
        </Suspense>
        <ClauseSpecimen />
      </section>

      <section className="section" id="changes" aria-labelledby="changes-title">
        <h2 id="changes-title">Latest changes</h2>
        <Suspense fallback={<p className="empty">Loading the record…</p>}>
          <RecentChanges />
        </Suspense>
      </section>

      <section className="section" id="platforms" aria-labelledby="platforms-title">
        <h2 id="platforms-title">Tracked platforms</h2>
        <Suspense fallback={<p className="empty">Loading the list…</p>}>
          <LivePlatformIndex />
        </Suspense>
      </section>

      <section className="section" aria-labelledby="why-title">
        <h2 id="why-title">Why this exists</h2>
        <div className="prose">
          <p>
            In October 2026,{" "}
            <ExternalLink href="https://lnkd.in/p/d2dgEpHY">clinicians began sharing</ExternalLink>{" "}
            summaries of a revised provider agreement from Headway. As
            described, it asked for a perpetual, irrevocable license to providers&rsquo; names, likenesses, photos,
            videos and voice recordings, including the right to alter them, create derivative works from them and
            sublicense them to others.
          </p>
          <p>
            Headway paused the rollout and said the wording was unclear and not what it meant to communicate. It was
            noticed only because clinicians read closely and compared notes in public. Most changes get no such
            scrutiny. They arrive as a one-line email or an &ldquo;Accept and continue&rdquo; button between you and
            your schedule, and the email rarely tells the whole story.
          </p>
        </div>
        <EmailVersusChanges />
        <div className="prose">
          <p>
            There was no shared, independent place to see what an agreement said, what it used to say, and what
            changed in between. Fine Print is that place.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="pattern-title">
        <h2 id="pattern-title">Why every version matters</h2>
        <div className="prose">
          <p>
            One change is a detail. Every change, kept in order, shows a direction. Platforms rarely move the line in
            one step. A clause is widened a little, then a little more. A bold
            version meets resistance and is withdrawn, then returns months later in softer words. Judged one email at
            a time, each step looks minor, and that is how terms drift past what most clinicians would ever have
            agreed to at once.
          </p>
          <p>
            Only a complete, dated history shows where an agreement is heading and what a platform has already tried.
            That is why Fine Print keeps every version, including the ones that were quietly pulled.
          </p>
        </div>
        <ClauseDrift />
      </section>

      <section className="section" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <HowItWorks />
        <div className="prose">
          <p>
            Public pages are checked twice a day; the few sites that block software are captured by hand. Terms sent
            privately, by email, in an app or as a contract, come from clinicians who{" "}
            <Link href="/submit">share them with us</Link>. An editor confirms each one with the sender, and senders
            are never named. <Link href="/about">More on how it works</Link>.
          </p>
        </div>
      </section>

      <section className="section" id="updates" aria-labelledby="updates-title">
        <h2 id="updates-title">Never miss a change</h2>
        <SubscribeForm
          platformSlug={EVERY_PLATFORM}
          page="/"
          label="Get an email when a platform changes its terms"
          className="subscribe-closing"
        />
      </section>

      <section className="section support" aria-labelledby="support-title">
        <h2 id="support-title">Support the record</h2>
        <div className="prose">
          <p>
            Fine Print is free, open source and answers to no platform. It is kept by one maintainer and the
            clinicians who contribute to it. There are three ways to help.
          </p>
        </div>
        <div className="support-grid">
          <div className="support-option">
            <p className="label">The most useful</p>
            <p className="support-title">Share an agreement</p>
            <p className="support-text">
              Terms a platform sent you by email, in its app or as a contract to sign. Your copy may be the only
              evidence they were ever offered. Confirmed with you first, never published with your name.
            </p>
            <Link href="/submit" className="button button-primary">
              Share an agreement privately
            </Link>
          </div>
          <div className="support-option">
            <p className="label">Optional</p>
            <p className="support-title">Support its upkeep</p>
            <p className="support-text">
              Servers, checks twice a day and the hours spent confirming submissions all cost something. If the record
              is useful to you, a small monthly contribution keeps it running and independent. The record stays free
              for everyone either way.
            </p>
            <ExternalLink href={PATREON_URL} className="button">
              Support on Patreon
            </ExternalLink>
          </div>
          <div className="support-option support-option-wide">
            <p className="label">Open source</p>
            <p className="support-title">Check or improve the code</p>
            <p className="support-text">
              Everything that fetches, compares and publishes the record is public under the MIT License. See exactly
              how it works, report a problem, or suggest a fix.
            </p>
            <ExternalLink href={GITHUB_URL} className="button">
              View the code on GitHub
            </ExternalLink>
          </div>
        </div>
        <p className="support-contact">
          Questions, corrections, or a platform we should track? Write to{" "}
          <a href={`mailto:${contactEmail()}`}>{contactEmail()}</a>.
        </p>
      </section>
    </>
  );
}

/** The names of the tracked platforms, so a visitor sees at once whether theirs is covered. */
async function TrackedNames() {
  await connection();
  const platforms = await getPlatforms();
  if (platforms.length === 0) return null;
  return (
    <p className="hero-tracking">
      Now tracking{" "}
      {platforms.map((p, i) => (
        <Fragment key={p.slug}>
          {i > 0 && " · "}
          <span>{p.name}</span>
        </Fragment>
      ))}
    </p>
  );
}

async function LivePlatformIndex() {
  await connection();
  const [platforms, statuses, facts] = await Promise.all([getPlatforms(), getStatuses(), getDocumentFacts()]);
  if (platforms.length === 0) return <p className="empty">No platforms are tracked yet.</p>;
  return <PlatformIndex platforms={platforms} statuses={statuses} facts={facts} />;
}

function PlatformIndex({
  platforms,
  statuses,
  facts,
}: {
  platforms: Platform[];
  statuses: Record<string, PublicStatus>;
  facts: Record<string, DocumentFacts>;
}) {
  return (
    <ul className="index">
      {platforms.map((p) => (
        <li key={p.slug} className="index-row">
          <p className="index-head">
            <Link href={`/${p.slug}`} className="index-name">
              {p.name}
            </Link>
            <span className="index-kind">{p.kind}</span>
            <Link href={`/${p.slug}#standing-title`} className="index-record">
              Timeline and PDF
            </Link>
          </p>
          <ul className="index-docs">
            {p.documents.map((d) => {
              const latest = facts[documentKey(p.slug, d.slug)]?.latest;
              return (
                <li key={d.slug}>
                  <Link href={`/${p.slug}/${d.slug}`}>{d.title}</Link>
                  <span className="leader" aria-hidden="true" />
                  <StatusLine doc={d} status={statuses[documentKey(p.slug, d.slug)]} latest={latest} />
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

async function RecentChanges() {
  await connection();
  const [all, platforms] = await Promise.all([getRecentChanges(12), getPlatforms()]);
  const changes = all.filter((v) => findDocument(platforms, v.platform, v.document));
  if (changes.length === 0) {
    return (
      <p className="empty">
        No changes recorded yet. Each document&rsquo;s first copy is on its page, and edits will appear here as soon
        as we detect one.
      </p>
    );
  }
  const shown = changes.slice(0, LATEST_SHOWN);
  const more = changes.slice(LATEST_SHOWN);
  return (
    <>
      <Docket versions={shown} showDocument platforms={platforms} />
      {more.length > 0 && (
        <details className="more-list">
          <summary>
            Show {more.length} earlier {more.length === 1 ? "change" : "changes"}
          </summary>
          <Docket versions={more} showDocument platforms={platforms} />
        </details>
      )}
    </>
  );
}

/** Changes listed in full on the home page; earlier ones are folded away. */
const LATEST_SHOWN = 4;
