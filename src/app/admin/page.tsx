import Link from "next/link";
import { Suspense } from "react";
import { listChanges, listSubmissions, STATUS_LABELS } from "@/lib/admin-data.ts";
import { requireAdmin } from "@/lib/auth.ts";
import { formatDay } from "@/lib/format.ts";
import { AdminBar } from "./AdminBar.tsx";

const SUMMARY_LABELS = {
  missing: "No summary",
  automatic: "AI draft, not reviewed",
  reviewed: "Reviewed",
  hidden: "Hidden",
} as const;

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
  const open = submissions.filter((s) => s.status === "new" || s.status === "contacted").length;
  const unreviewed = changes.filter((c) => c.summaryState === "automatic" || c.summaryState === "missing").length;

  return (
    <>
      <AdminBar admin={admin} />
      <h1 className="admin-title">Editor&rsquo;s desk</h1>
      {(await deleted) && (
        <p className="form-ok" role="status">
          The submission was deleted.
        </p>
      )}

      <section className="section" aria-labelledby="subs-title">
        <div className="section-head">
          <h2 id="subs-title">Private submissions</h2>
          <span className="label">{open} waiting</span>
        </div>
        {submissions.length === 0 ? (
          <p className="empty">Nothing has been submitted yet.</p>
        ) : (
          <ol className="docket">
            {submissions.map((s) => (
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
                  </span>
                  <span className={`method${s.status === "new" ? " is-new" : ""}`}>{STATUS_LABELS[s.status]}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="section" aria-labelledby="changes-title">
        <div className="section-head">
          <h2 id="changes-title">Change summaries</h2>
          <span className="label">{unreviewed} to review</span>
        </div>
        {changes.length === 0 ? (
          <p className="empty">No changes recorded yet.</p>
        ) : (
          <ol className="docket">
            {changes.map((c) => (
              <li key={c.id}>
                <time className="mono" dateTime={c.capturedAt.toISOString()}>
                  {formatDay(c.capturedAt.toISOString())}
                </time>
                <div className="docket-what">
                  <Link href={`/admin/changes/${c.id}`} prefetch={false}>
                    {c.title}
                  </Link>
                  <span className={`method${c.summaryState === "reviewed" ? "" : " is-new"}`}>
                    {SUMMARY_LABELS[c.summaryState]}
                  </span>
                </div>
                {c.headline && <p className="docket-summary">{c.headline}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
