import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it works",
  description: "How Fine Print captures platform terms, how often it checks, and what its limits are.",
};

export default function About() {
  return (
    <article className="prose">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
      </nav>
      <h1>How it works</h1>
      <p className="lede" style={{ marginTop: "1rem" }}>
        Fine Print keeps a public, dated copy of the terms that healthcare software platforms publish, so
        anyone can see what an agreement said on a given day and how it changed since.
      </p>

      <h2>What we capture</h2>
      <p>
        Only documents the platforms publish openly on their own websites. For each one we store the text of the
        agreement, the date we first saw it, and the most recent date we found it still published. Menus, cookie
        banners and other page furniture are left out.
      </p>

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

      <h2>Documents captured by hand</h2>
      <p>
        Some platforms block automated checks or only show their terms after JavaScript runs in a browser. For those,
        a maintainer opens the page in a normal browser, saves it, and imports it. These versions are marked
        &ldquo;Captured by hand&rdquo; and are checked less often.
      </p>

      <h2>Summaries</h2>
      <p>
        Each recorded change gets a short summary in plain English, written by an AI model (OpenAI&rsquo;s GPT-5.4 mini) from
        the changed paragraphs only. Until an editor has checked
        it, a summary is labelled as an unreviewed AI draft. Editors can correct or withdraw any summary. The redline
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

      <h2>Limits</h2>
      <p>
        Fine Print is not legal advice and is not affiliated with any platform listed. A missed check or a page that
        changed layout can leave gaps in the record. Agreements sent privately appear only once someone shares one
        and we can confirm it. The platform&rsquo;s own site is always the authority on what is currently in force.
      </p>
    </article>
  );
}
