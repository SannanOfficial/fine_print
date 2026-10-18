"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <section className="prose" style={{ paddingTop: "3rem" }}>
      <p className="eyebrow">Error</p>
      <h1>Something went wrong</h1>
      <p className="lede" style={{ marginTop: "1rem" }}>
        This page couldn&rsquo;t be loaded just now. The record itself is safe; try again in a minute.
      </p>
      <div className="cta">
        <button type="button" onClick={() => retry()} className="button">
          Try again
        </button>
        <p>
          or <Link href="/">go to the home page</Link>
        </p>
      </div>
    </section>
  );
}
