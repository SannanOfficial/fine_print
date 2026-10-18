import Link from "next/link";
import { Suspense } from "react";
import { listChanges, listPlatformsWithFacts, listSubmissions, STATUS_LABELS, type ChangeRow, type SubmissionRow } from "@/lib/admin-data.ts";
import { requireAdmin } from "@/lib/auth.ts";
import { formatDay } from "@/lib/format.ts";
import { AdminBar } from "./AdminBar.tsx";
import { AdminStatus } from "./platforms/AdminStatus.tsx";

const SUMMARY_LABELS = {
  missing: "No summary",
  automatic: "AI draft, not reviewed",
  reviewed: "Reviewed",
  hidden: "Hidden",
  "not-needed": "Only formatting changed",
} as const;

function SubmissionRows({ rows }: { rows: SubmissionRow[] }) {
  return (
    <ol className="docket">
      {rows.map((s) => {
        return (
          <li key={s.id}>
            <time className="mono" dateTime={s.receivedAt.toISOString()}>
              {formatDay(s.receivedAt.toISOString())}
            </time>
            <div className="docket-what">
              <span>
                <Link href={`/admin/submissions/${s.id}`} prefetch={false}>
                  {s.platform}: {s.documentName}
                </Link>
                <span className="index-kind"> · from {s.senderName}</span>
                {/* The submit page promises contact within about a week. */}
                {s.waitingDays >= 7 && <span className="status-warn"> · waiting {s.waitingDays} days</span>}
              </span>
              <span className={`method${s.status === "new" ? " is-new" : ""}`}>{STATUS_LABELS[s.status]}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ChangeRows({ rows }: { rows: ChangeRow[] }) {
  return (
    <ol className="docket">
      {rows.map((c) => (
        <li key={c.id}>
          <time className="mono" dateTime={c.capturedAt.toISOString()}>
            {formatDay(c.capturedAt.toISOString())}
          </time>
          <div className="docket-what">
            <Link href={`/admin/changes/${c.id}`} prefetch={false}>
              {c.title}
            </Link>
            <span className={`method${c.summaryState === "automatic" || c.summaryState === "missing" ? " is-new" : ""}`}>
              {SUMMARY_LABELS[c.summaryState]}
            </span>
          </div>
          {c.headline && <p className="docket-summary">{c.headline}</p>}
        </li>
      ))}
    </ol>
  );
}

export default function AdminHome({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <Dashboard deleted={searchParams.then((p) => p.deleted === "1")} />
    </Suspense>
  );
}

async function Dashboard({ deleted }: { deleted: Promise<boolean> }) {
  const admin = await requireAdmin();
  const [submissions, changes, platforms] = await Promise.all([listSubmissions(), listChanges(), listPlatformsWithFacts()]);
  // Automatic checks failing more than once in a row, and documents still waiting for a first copy by hand.
  const attention = platforms.flatMap((p) =>
    p.rows
      .filter((r) => (r.mode === "auto" ? (r.status?.consecutiveFailures ?? 0) >= 2 : r.versions === 0))
      .map((r) => ({ platform: p, row: r })),
  );
  // Confirmed submissions still need adding to the record, so they stay in the open list.
  const isOpen = (s: (typeof submissions)[number]) => s.status === "new" || s.status === "contacted" || s.status === "confirmed";
  const openSubs = submissions.filter(isOpen);
  const doneSubs = submissions.filter((s) => !isOpen(s));
  const needsReview = (c: (typeof changes)[number]) => c.summaryState === "automatic" || c.summaryState === "missing";
  const openChanges = changes.filter(needsReview);
  const doneChanges = changes.filter((c) => !needsReview(c));
  return (
    <>
      <AdminBar admin={admin} />
      <h1 className="admin-title">Editor&rsquo;s desk</h1>
      <div className="cta">
        <Link href="/admin/record" className="button button-primary">
          Add a record by hand
        </Link>
        <p>Paste, upload or fetch a new version of any tracked document.</p>
      </div>
      {(await deleted) && (
        <p className="form-ok" role="status">
          The submission was deleted.
        </p>
      )}

      <section className="section" aria-labelledby="subs-title">
        <div className="section-head">
          <h2 id="subs-title">Private submissions</h2>
          <span className="label">{openSubs.length} waiting</span>
        </div>
        {submissions.length === 0 ? (
          <p className="empty">Nothing has been submitted yet.</p>
        ) : openSubs.length === 0 ? (
          <p className="empty">Nothing waiting. Every submission has been dealt with.</p>
        ) : (
          <SubmissionRows rows={openSubs} />
        )}
        {doneSubs.length > 0 && (
          <details className="done-list">
            <summary>Dealt with ({doneSubs.length})</summary>
            <SubmissionRows rows={doneSubs} />
          </details>
        )}
      </section>

      {attention.length > 0 && (
        <section className="section" aria-labelledby="attention-title">
          <div className="section-head">
            <h2 id="attention-title">Documents needing attention</h2>
            <span className="label">{attention.length}</span>
          </div>
          <ul className="index-docs admin-docs">
            {attention.map(({ platform, row }) => (
              <li key={`${platform.slug}/${row.slug}`}>
                <Link href={`/admin/platforms/${platform.slug}/${row.slug}`}>
                  {platform.name}: {row.title}
                </Link>
                <span className="leader" aria-hidden="true" />
                {row.mode === "manual" ? <span className="status status-warn">No copy yet · capture it by hand</span> : <AdminStatus row={row} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="changes-title">
        <div className="section-head">
          <h2 id="changes-title">Change summaries</h2>
          <span className="label">{openChanges.length} to review</span>
        </div>
        {changes.length === 0 ? (
          <p className="empty">No changes recorded yet.</p>
        ) : openChanges.length === 0 ? (
          <p className="empty">Every summary has been reviewed.</p>
        ) : (
          <ChangeRows rows={openChanges} />
        )}
        {doneChanges.length > 0 && (
          <details className="done-list">
            <summary>Reviewed, hidden or nothing to summarise ({doneChanges.length})</summary>
            <ChangeRows rows={doneChanges} />
          </details>
        )}
      </section>
    </>
  );
}
