"use client";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <section className="prose" style={{ paddingTop: "3rem" }}>
      <p className="eyebrow">Error</p>
      <h1>The record could not be loaded</h1>
      <p className="lede" style={{ marginTop: "1rem" }}>
        Our database did not respond. Nothing has been lost; try again in a minute.
      </p>
      <button type="button" onClick={() => retry()} className="button">
        Try again
      </button>
    </section>
  );
}
