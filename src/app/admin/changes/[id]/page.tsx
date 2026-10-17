import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Redline, RedlineLegend } from "@/components/Redline.tsx";
import { diffDocuments } from "@/core/diff.ts";
import { getChange } from "@/lib/admin-data.ts";
import { requireAdmin } from "@/lib/auth.ts";
import { formatDay, formatDayTime } from "@/lib/format.ts";
import { AdminBar } from "../../AdminBar.tsx";
import { SummaryEditor } from "../../forms.tsx";

export default function ChangePage({ params }: PageProps<"/admin/changes/[id]">) {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      {params.then(({ id }) => (
        <Change id={id} />
      ))}
    </Suspense>
  );
}

const STATE_TEXT = {
  automatic: "AI draft, not yet reviewed. Shown publicly with that label.",
  reviewed: "Reviewed. Shown publicly as checked by an editor.",
  hidden: "Hidden from the public site.",
} as const;

async function Change({ id }: { id: string }) {
  const admin = await requireAdmin();
  const change = await getChange(id);
  if (!change) notFound();
  const { version, previous, summary, title } = change;
  const publicHref = `/${version.platform}/${version.document}/${id}`;

  return (
    <>
      <AdminBar admin={admin} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/admin">All changes</Link>
      </nav>
      <p className="eyebrow">{title}</p>
      <h1>Changed {formatDay(version.capturedAt.toISOString())}</h1>

      <dl className="facts">
        <dt>Summary</dt>
        <dd>{summary ? STATE_TEXT[summary.state] : "None yet."}</dd>
        {summary?.model && (
          <>
            <dt>First draft</dt>
            <dd>
              {summary.model}
              {summary.generatedAt && `, ${formatDayTime(summary.generatedAt.toISOString())}`}
            </dd>
          </>
        )}
        {summary?.updatedBy && (
          <>
            <dt>Last edited</dt>
            <dd>
              {formatDayTime(summary.updatedAt.toISOString())} by {summary.updatedBy}
            </dd>
          </>
        )}
        <dt>Public page</dt>
        <dd>
          <Link href={publicHref}>{publicHref}</Link>
        </dd>
      </dl>

      <section className="section" aria-labelledby="edit-title">
        <div className="section-head">
          <h2 id="edit-title">Edit the summary</h2>
        </div>
        <SummaryEditor id={id} headline={summary?.headline ?? ""} points={summary?.points ?? []} />
        <p className="note">
          Describe what changed, neutrally. Check every point against the redline below. To ask the AI for a fresh
          draft, run <code>npm run summarize -- --id {id} --force</code>.
        </p>
      </section>

      <section className="section" aria-labelledby="redline-title">
        <div className="section-head">
          <h2 id="redline-title">The redline</h2>
        </div>
        <RedlineLegend />
        <div className="sheet">
          <Redline entries={diffDocuments(previous.content, version.content)} />
        </div>
      </section>
    </>
  );
}
