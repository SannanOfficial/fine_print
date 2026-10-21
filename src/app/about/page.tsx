import type { Metadata } from "next";
import Link from "next/link";
import { CheckTimeline, HowItWorks, TwoSources } from "@/components/Infographics.tsx";
import { pageMetadata } from "@/lib/meta.ts";
import { breadcrumbs, JsonLd, webPage } from "@/lib/structured-data.tsx";

const title = "How Fine Print tracks platform terms";
const description =
  "How Fine Print captures the terms healthcare platforms publish, how often it checks, how changes and AI summaries work, and what the record can't show.";

export const metadata: Metadata = pageMetadata({ title, description, path: "/about" });

export default function About() {
  return (
    <article>
      <JsonLd data={[webPage({ path: "/about", type: "AboutPage", name: title, description }), breadcrumbs([{ name: "How it works", path: "/about" }])]} />
      <div className="prose">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
        </nav>
        <h1>How it works</h1>
        <p className="lede" style={{ marginTop: "1rem" }}>
          Fine Print keeps a public, dated copy of the terms that healthcare software platforms publish, so
          anyone can see what an agreement said on a given day and how it changed since.
        </p>
        <p>
          It is free, open source and answers to no platform. It does not tell you what to sign. It keeps an exact
          record, so that clinicians, professional associations and journalists can read the terms for themselves and
          hold platforms to what they wrote.
        </p>
      </div>
      <HowItWorks />
      <div className="prose">
        <h2>What we capture</h2>
        <p>
          Documents the platforms publish on their own websites, and agreements clinicians send us that a platform
          showed them privately (see below). For each version we store the text of the agreement, the date we first saw
          it, and the most recent date we found it still published. Menus, cookie banners and other page furniture are
          left out.
        </p>
        <p>
          A public terms page is only part of the picture. Some of the most consequential terms are never posted: they
          come by email, in a pop-up you must accept before you can sign in, or in a contract sent to one group of
          providers. So the record has two sources.
        </p>
      </div>
      <TwoSources />
      <div className="prose">
        <h2>How often we check</h2>
        <p>
          Twice a day, at around 5 a.m. and 5 p.m. US Eastern time. Terms rarely change more than a few times a year,
          but a platform can publish a change and withdraw it within days. Checking twice a day catches those short-lived
          versions while keeping our traffic to each site to a few requests a day.
        </p>
        <p>
          When a check finds different text, we wait and load the page again before recording anything. Only a change
          that shows up on both loads is recorded, so temporary glitches and page experiments do not appear as changes.
        </p>
      </div>
      <CheckTimeline />
      <div className="prose">
        <h2>Documents captured by hand</h2>
        <p>
          Some platforms block automated checks or only show their terms after JavaScript runs in a browser. For those,
          an editor opens the page in a normal browser, saves it, and imports it. These versions are marked
          &ldquo;Captured by hand&rdquo;. They are updated only when an editor captures a fresh copy, so they can lag
          behind the live page. If you notice a change first, <Link href="/submit">tell us</Link>.
        </p>

        <h2>Summaries</h2>
        <p>
          Each recorded change gets a short summary in plain English, written by an AI model from the changed
          paragraphs only. Until an editor has checked it, a summary is labelled as an unreviewed AI draft. A draft that
          names a web or email address is never published, since the platform&rsquo;s own text may have steered it; an
          editor writes those. Editors can correct or withdraw any summary. The redline
          is always the exact record; a summary can leave things out.
        </p>

        <h2>Agreements shared privately</h2>
        <p>
          Clinicians can <Link href="/submit">send us</Link> terms or policy updates that a platform showed them by
          email, in its app or as a contract. Submissions and the sender&rsquo;s contact details are encrypted as soon
          as they arrive and only editors can read them. An editor contacts the sender to confirm the submission before
          any of it is published, and the sender&rsquo;s name and contact details are never published. Private
          submissions are never sent to an AI service.
        </p>

        <h2>How we treat the sites we check</h2>
        <ul>
          <li>Our checker identifies itself as FinePrintBot and links to this page.</li>
          <li>It follows each site&rsquo;s robots.txt rules.</li>
          <li>It loads one page at a time, with a pause between requests.</li>
          <li>It never logs in and never reads anything that is not public.</li>
        </ul>

        <h2>Who the record is for</h2>
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
      <div className="prose">
        <h2>Limits</h2>
        <p>
          Fine Print is not legal advice and is not affiliated with any platform listed. A missed check or a page that
          changed layout can leave gaps in the record. Agreements sent privately appear only once someone shares one
          and we can confirm it. The platform&rsquo;s own site is always the authority on what is currently in force.
        </p>
      </div>
    </article>
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
