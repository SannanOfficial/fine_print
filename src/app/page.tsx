import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckTimeline, ClauseDrift, ClauseSpecimen, EmailVersusChanges, HowItWorks, TwoSources } from "@/components/Infographics.tsx";
import { Docket, StatusLine } from "@/components/Record.tsx";
import { documentKey, type Platform } from "@/core/platforms.ts";
import { getHistory, getRecentChanges, getStatuses, type PublicStatus, type VersionSummary } from "@/lib/data.ts";
import { getPlatforms } from "@/lib/registry.ts";

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>The fine print keeps moving.</h1>
        <p className="lede">
          EHRs, billing and credentialing services, telehealth networks and directories keep rewriting the terms
          clinicians practice under. Some revisions are routine. Others test how much you will accept: rights to your
          name and voice, shorter notice, new limits on leaving. Fine Print logs every version, word for word, so
          that no change goes unseen and the pattern is plain to everyone.
        </p>
        <ClauseSpecimen />
      </section>

      <section className="section" aria-labelledby="why-title">
        <h2 id="why-title">Why this exists</h2>
        <div className="prose">
          <p>
            In October 2026,{" "}
            <a href="https://lnkd.in/p/d2dgEpHY" rel="noopener noreferrer">
              clinicians began sharing
            </a>{" "}
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
            Software watches every public page, around the clock. Clinicians fill in the rest. When a platform shows
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

      <section className="section" aria-labelledby="changes-title">
        <h2 id="changes-title">Recent changes</h2>
        <Suspense fallback={<p className="empty">Loading the record…</p>}>
          <RecentChanges />
        </Suspense>
      </section>
    </>
  );
}

async function LivePlatformIndex() {
  await connection();
  const [platforms, statuses, history] = await Promise.all([getPlatforms(), getStatuses(), getHistory()]);
  if (platforms.length === 0) return <p className="empty">No platforms are tracked yet.</p>;
  return <PlatformIndex platforms={platforms} statuses={statuses} history={history} />;
}

function PlatformIndex({
  platforms,
  statuses,
  history,
}: {
  platforms: Platform[];
  statuses: Record<string, PublicStatus>;
  history: VersionSummary[];
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
          </p>
          <ul className="index-docs">
            {p.documents.map((d) => {
              const latest = history.find((v) => v.platform === p.slug && v.document === d.slug);
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
  const [changes, platforms] = await Promise.all([getRecentChanges(12), getPlatforms()]);
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
