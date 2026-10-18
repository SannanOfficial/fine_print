import Link from "next/link";
import { findDocument, type Platform, type TrackedDocument } from "@/core/platforms.ts";
import type { CaptureMethod } from "@/core/records.ts";
import type { PublicStatus, VersionSummary } from "@/lib/data.ts";
import { describeOutcome, describeStats, formatDay, formatDayTime } from "@/lib/format.ts";

export function versionHref(v: Pick<VersionSummary, "platform" | "document" | "id">): string {
  return `/${v.platform}/${v.document}/${v.id}`;
}

/** One line describing where a document stands, for lists. */
export function StatusLine({
  doc,
  status,
  latest,
}: {
  doc: TrackedDocument;
  status: PublicStatus | undefined;
  latest: VersionSummary | undefined;
}) {
  if (!latest && doc.mode === "manual") {
    return <span className="status status-warn">Waiting for a copy captured by hand</span>;
  }
  if (!status && !latest) return <span className="status status-ok">Waiting for first check</span>;

  const outcome = status ? describeOutcome(status.lastOutcome) : null;
  const lastChange = latest && !latest.isFirst ? `Changed ${formatDay(latest.capturedAt)}` : "No changes yet";
  if (outcome && !outcome.ok) {
    // Keep the most useful fact (when it last changed) next to the warning.
    return (
      <span className="status status-warn">
        {latest ? `${lastChange} · ` : ""}
        {outcome.text}
      </span>
    );
  }

  const checked = status ? ` · checked ${formatDay(status.lastCheckedAt)}` : "";
  return (
    <span className="status status-ok">
      {lastChange}
      {checked}
    </span>
  );
}

/** Short label for how a version reached the record. Null for automatic checks. */
export const METHOD_TAG: Record<CaptureMethod, string | null> = {
  auto: null,
  manual: "Captured by hand",
  submission: "Shared by a clinician",
};

/** Dated list of versions, newest first. */
export function Docket({
  versions,
  showDocument,
  platforms,
}: {
  versions: VersionSummary[];
  showDocument: boolean;
  platforms: Platform[];
}) {
  return (
    <ol className="docket">
      {versions.map((v) => {
        const found = findDocument(platforms, v.platform, v.document);
        if (!found) return null; // a document that is no longer tracked
        return (
          <li key={v.id}>
            <time className="mono" dateTime={v.capturedAt} title={formatDayTime(v.capturedAt)}>
              {formatDay(v.capturedAt)}
            </time>
            <div className="docket-what">
              <span>
                <Link
                  href={versionHref(v)}
                  prefetch={false}
                  title={v.isFirst ? "The first text we recorded; there is nothing earlier to compare it with" : undefined}
                >
                  {showDocument ? `${found.platform.name}: ${found.document.title}` : describeStats(v.stats)}
                </Link>
                {showDocument && <span className="index-kind"> · {describeStats(v.stats)}</span>}
              </span>
              {METHOD_TAG[v.method] && <span className="method">{METHOD_TAG[v.method]}</span>}
            </div>
            {v.summary && (
              <p className="docket-summary">
                {v.summary.headline}
                <span className="index-kind">
                  {" "}
                  · {!v.summary.byAi ? "editor's summary" : v.summary.reviewed ? "AI summary, checked by an editor" : "AI draft, not yet checked"}
                </span>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
