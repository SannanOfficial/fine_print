import Link from "next/link";
import { Suspense } from "react";
import { listChanges, listSubmissions, STATUS_LABELS, type ChangeRow, type SubmissionRow } from "@/lib/admin-data.ts";
import { requireAdmin } from "@/lib/auth.ts";
import { formatDay } from "@/lib/format.ts";
import { AdminBar } from "./AdminBar.tsx";

const SUMMARY_LABELS = {
  missing: "No summary",
  automatic: "AI draft, not reviewed",
  reviewed: "Reviewed",
  hidden: "Hidden",
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
            <span className={`method${c.summaryState === "reviewed" ? "" : " is-new"}`}>{SUMMARY_LABELS[c.summaryState]}</span>
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
  const [submissions, changes] = await Promise.all([listSubmissions(), listChanges()]);
  const isOpen = (s: (typeof submissions)[number]) => s.status === "new" || s.status === "contacted";
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
            <summary>Reviewed or hidden ({doneChanges.length})</summary>
            <ChangeRows rows={doneChanges} />
          </details>
        )}
      </section>
    </>
  );
}
