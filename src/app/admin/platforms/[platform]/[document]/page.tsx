import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { METHOD_TAG } from "@/components/Record.tsx";
import { MANUAL_REASONS, type TrackedDocument } from "@/core/platforms.ts";
import { getDocumentForEdit, getSubmissionForRecord } from "@/lib/admin-data.ts";
import { requireAdmin } from "@/lib/auth.ts";
import { describeOutcome, formatDayTime } from "@/lib/format.ts";
import { AdminBar } from "../../../AdminBar.tsx";
import type { DocumentValues } from "../../actions.ts";
import { DeleteForm, DocumentForm, RecordForm } from "../../forms.tsx";

type Query = { recorded?: string; added?: string; from?: string };

export default function DocumentAdmin({ params, searchParams }: PageProps<"/admin/platforms/[platform]/[document]">) {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      {Promise.all([params, searchParams]).then(([{ platform, document }, query]) => (
        <DocumentEditor
          platformSlug={platform}
          documentSlug={document}
          query={Object.fromEntries(
            Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string"),
          ) as Query}
        />
      ))}
    </Suspense>
  );
}

function settingsValues(d: TrackedDocument): DocumentValues {
  const preset = d.manualReason === MANUAL_REASONS.blocked ? "blocked" : d.manualReason === MANUAL_REASONS.browser ? "browser" : "custom";
  return {
    slug: d.slug,
    title: d.title,
    audience: d.audience,
    url: d.url ?? "",
    mode: d.mode,
    manualPreset: d.mode === "manual" ? preset : "blocked",
    manualCustom: preset === "custom" ? (d.manualReason ?? "") : "",
    selectors: d.selectors.join("\n"),
    remove: (d.remove ?? []).join("\n"),
    redirectHosts: (d.redirectHosts ?? []).join("\n"),
    source: d.source ?? "",
  };
}

async function DocumentEditor({ platformSlug, documentSlug, query }: { platformSlug: string; documentSlug: string; query: Query }) {
  const admin = await requireAdmin();
  const found = await getDocumentForEdit(platformSlug, documentSlug);
  if (!found) notFound();
  const { platform, document: doc, versions, status } = found;
  const submission = query.from ? await getSubmissionForRecord(query.from) : null;
  const outcome = status ? describeOutcome(status.lastOutcome) : null;
  const publicHref = `/${platform.slug}/${doc.slug}`;

  return (
    <>
      <AdminBar admin={admin} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/admin/platforms">All platforms</Link> / <Link href={`/admin/platforms/${platform.slug}`}>{platform.name}</Link>
      </nav>
      <p className="eyebrow">{platform.name}</p>
      <h1>{doc.title}</h1>
      {query.recorded && (
        <p className="form-ok" role="status">
          Recorded. <Link href={`${publicHref}/${query.recorded}`}>See it on the public site</Link>.
        </p>
      )}
      {query.added && (
        <p className="form-ok" role="status">
          Document added. Record its first version below.
        </p>
      )}

      <dl className="facts">
        <dt>Public page</dt>
        <dd>
          <Link href={publicHref}>{publicHref}</Link>
        </dd>
        <dt>Captured</dt>
        <dd>{doc.mode === "auto" ? "Automatically, twice a day" : `By hand. ${doc.manualReason}`}</dd>
        <dt>Last check</dt>
        <dd>
          {status ? (
            <>
              {formatDayTime(status.lastCheckedAt.toISOString())} · {outcome?.text}
              {status.lastError && <span className="status-warn"> · {status.lastError}</span>}
            </>
          ) : (
            "Never"
          )}
        </dd>
      </dl>

      <section className="section" aria-labelledby="record-title">
        <div className="section-head">
          <h2 id="record-title">Record a new version</h2>
        </div>
        <RecordForm
          platformSlug={platform.slug}
          documentSlug={doc.slug}
          hasUrl={Boolean(doc.url)}
          fromSubmission={submission?.reference ?? null}
          initial={{
            text: submission?.text ?? "",
            sourceUrl: submission ? "" : (doc.url ?? ""),
            fetchedHash: "",
            submissionId: submission?.id ?? "",
          }}
        />
      </section>

      <section className="section" aria-labelledby="versions-title">
        <div className="section-head">
          <h2 id="versions-title">On the record</h2>
          <span className="label">{versions.length === 50 ? "latest 50" : versions.length}</span>
        </div>
        {versions.length === 0 ? (
          <p className="empty">Nothing recorded yet.</p>
        ) : (
          <ol className="docket">
            {versions.map((v) => (
              <li key={v.id}>
                <time className="mono" dateTime={v.capturedAt.toISOString()}>
                  {formatDayTime(v.capturedAt.toISOString())}
                </time>
                <div className="docket-what">
                  <span>
                    <Link href={v.isFirst ? `${publicHref}/${v.id}` : `/admin/changes/${v.id}`} prefetch={false}>
                      {v.isFirst ? "First copy" : "Change"}
                    </Link>
                    <span className="index-kind">
                      {" "}
                      · {v.chars.toLocaleString("en-US")} characters{v.recordedBy && ` · by ${v.recordedBy}`}
                    </span>
                  </span>
                  {METHOD_TAG[v.method] && <span className="method">{METHOD_TAG[v.method]}</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="note">Versions can&rsquo;t be edited or deleted from the website. The record only grows.</p>
      </section>

      <section className="section" aria-labelledby="settings-title">
        <div className="section-head">
          <h2 id="settings-title">Settings</h2>
        </div>
        <DocumentForm platformSlug={platform.slug} documentSlug={doc.slug} initial={settingsValues(doc)} />
      </section>

      {versions.length === 0 && (
        <section className="section" aria-labelledby="delete-title">
          <div className="section-head">
            <h2 id="delete-title">Delete</h2>
          </div>
          <DeleteForm
            platformSlug={platform.slug}
            documentSlug={doc.slug}
            hint="Stops tracking this document. Only possible while nothing has been recorded for it."
          />
        </section>
      )}
    </>
  );
}
