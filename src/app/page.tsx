import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ExternalLink } from "@/components/ExternalLink.tsx";
import { CheckTimeline, ClauseDrift, ClauseSpecimen, EmailVersusChanges, HowItWorks, TwoSources } from "@/components/Infographics.tsx";
import { Docket, StatusLine } from "@/components/Record.tsx";
import { documentKey, findDocument, type Platform } from "@/core/platforms.ts";
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
          EHRs, billing and credentialing services, telehealth networks and directories keep rewriting the terms
          clinicians practice under. Some revisions are routine. Others test how much you will accept: rights to your
          name and voice, shorter notice, new limits on leaving. Fine Print logs every version, word for word, so
          that changes don&rsquo;t slip by unnoticed and the pattern is plain to everyone.
        </p>
        <nav className="hero-links" aria-label="Start here">
          <a href="#platforms">Find your platform</a>
          <a href="#changes">See recent changes</a>
          <Link href="/submit">Share an agreement</Link>
        </nav>
        <ClauseSpecimen />
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

      <section className="section" aria-labelledby="sources-title">
        <h2 id="sources-title">Two ways into the record</h2>
        <div className="prose">
          <p>
            A public terms page is only part of the picture. Some of the most consequential terms are never posted:
            they come by email, in a pop-up you must accept before you can sign in, or in a contract sent to one
            group of providers. A record built only by software would miss them, so this one has two sources.
          </p>
        </div>
        <TwoSources />
        <div className="prose">
          <p>
            Software checks every public page it can read twice a day; the few sites that block it are captured
            by hand. Clinicians fill in the rest. When a platform shows
            you new terms, send them in. An editor confirms each submission with the person who sent it before it
            joins the record, and senders are never named.
          </p>
          <div className="cta">
            <Link href="/submit" className="button button-primary">
              Share an agreement privately
            </Link>
            <p>It takes a few minutes. Your details are encrypted and never published.</p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="how-title">
        <h2 id="how-title">How public pages are watched</h2>
        <HowItWorks />
      </section>

      <section className="section" aria-labelledby="often-title">
        <h2 id="often-title">Why we check twice a day</h2>
        <CheckTimeline />
      </section>

      <section className="section" aria-labelledby="independent-title">
        <h2 id="independent-title">Independent, and open</h2>
        <div className="prose">
          <p>
            Fine Print is free, open source and answers to no platform. It does not tell you what to sign. It keeps
            an exact record, so that clinicians, professional associations and journalists can read the terms for
            themselves and hold platforms to what they wrote.
          </p>
          <p>
            It is not legal advice, and the platform&rsquo;s own site is always the authority on what is in force
            today.
          </p>
        </div>
      </section>

      <section className="section" id="platforms" aria-labelledby="platforms-title">
        <h2 id="platforms-title">Tracked platforms</h2>
        <Suspense fallback={<p className="empty">Loading the list…</p>}>
          <LivePlatformIndex />
        </Suspense>
      </section>

      <section className="section" id="changes" aria-labelledby="changes-title">
        <h2 id="changes-title">Recent changes</h2>
        <Suspense fallback={<p className="empty">Loading the record…</p>}>
          <RecentChanges />
        </Suspense>
      </section>

      <section className="section" aria-labelledby="who-title">
        <h2 id="who-title">Who the record is for</h2>
        <div className="prose">
          <p>
            Anyone who has to decide whether to trust a platform with their practice, or who speaks for those who do.
          </p>
        </div>
        <ol className="audiences">
          {AUDIENCES.map((a) => (
            <li key={a.who}>
              <p className="audience-who">{a.who}</p>
              <p className="audience-use">{a.use}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section support" aria-labelledby="support-title">
        <h2 id="support-title">Support the record</h2>
        <div className="prose">
          <p>
            Fine Print is kept by one maintainer and the clinicians who contribute to it. There are three ways to help.
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

const AUDIENCES = [
  {
    who: "Practices choosing software",
    use: "Group practices and clinics comparing EHRs, billing services and networks can see how each vendor has treated its terms over time, and choose providers that behave ethically, not just ones that advertise it.",
  },
  {
    who: "Clinicians asked to accept",
    use: "Before you click “Accept and continue”, see exactly what changed since the version you signed, word for word, instead of relying on a one-line email.",
  },
  {
    who: "Practice managers and compliance",
    use: "Keep a dated copy of the agreement in force on any given day, for audits, disputes, credentialing files and contract renewals.",
  },
  {
    who: "Professional associations and advocates",
    use: "Spot a trend across platforms early, point members to the exact clause, and negotiate with evidence rather than anecdotes.",
  },
  {
    who: "Journalists and researchers",
    use: "Cite a permanent, public record of what a platform asked for and when, including versions that were quietly withdrawn.",
  },
  {
    who: "Attorneys and advisers",
    use: "Read the redline between two dates in seconds, rather than reconstructing old terms from screenshots and memory.",
  },
] as const;

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
  return <Docket versions={changes} showDocument platforms={platforms} />;
}
