import Link from "next/link";

export default function NotFound() {
  return (
    <section className="prose" style={{ paddingTop: "3rem" }}>
      <p className="eyebrow">404</p>
      <h1>There is no page at this address</h1>
      <p className="lede" style={{ marginTop: "1rem" }}>
        The platform or document may not be tracked, or the link may be incomplete.
      </p>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/#platforms">See all tracked platforms</Link>
      </p>
    </section>
  );
}
