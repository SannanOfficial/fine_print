import type { Platform } from "@/core/platforms.ts";
import type { CaptureMethod } from "@/core/records.ts";
import type { ChangeSummary, VersionSummary } from "./data.ts";

/*
 * A company's record as one timeline: every change to every document it
 * asks clinicians to accept, newest first, each with its date and summary.
 * The page and the PDF are both built from this, so they always agree.
 */

export interface TimelineItem {
  id: string;
  documentSlug: string;
  documentTitle: string;
  /** When the change happened, as best we know: the date on the document if an editor gave one, otherwise when it was recorded. */
  date: string;
  /** Set when `date` came from the document and it was recorded on a different day. */
  recordedAt: string | null;
  /** The first copy of a document: when tracking began, not a change. */
  isStart: boolean;
  method: CaptureMethod;
  stats: VersionSummary["stats"];
  summary: ChangeSummary | null;
  href: string;
}

const dayOf = (iso: string) => iso.slice(0, 10);

export function buildTimeline(platform: Platform, history: VersionSummary[]): TimelineItem[] {
  const titles = new Map(platform.documents.map((d) => [d.slug, d.title]));
  return history
    .filter((v) => v.platform === platform.slug && titles.has(v.document))
    .map((v) => {
      const date = v.datedOn ? `${v.datedOn}T00:00:00.000Z` : v.capturedAt;
      return {
        id: v.id,
        documentSlug: v.document,
        documentTitle: titles.get(v.document)!,
        date,
        recordedAt: v.datedOn && dayOf(v.capturedAt) !== v.datedOn ? v.capturedAt : null,
        isStart: v.isFirst,
        method: v.method,
        stats: v.stats,
        summary: v.summary,
        href: `/${v.platform}/${v.document}/${v.id}`,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || (b.recordedAt ?? b.date).localeCompare(a.recordedAt ?? a.date));
}

/** Newest year first, each with its items in timeline order. */
export function byYear(items: TimelineItem[]): [string, TimelineItem[]][] {
  const years = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const year = item.date.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), item]);
  }
  return [...years];
}

/** Plain facts about a company's record, for the overview. Fine Print reports them; it doesn't score them. */
export interface Standing {
  documents: number;
  trackedSince: string | null;
  changes: number;
  lastChange: string | null;
  changesInLastYear: number;
  /** Changes known only because a clinician shared what the platform sent them. */
  sharedPrivately: number;
  summaries: { reviewed: number; aiDrafts: number; none: number };
}

export function standingOf(platform: Platform, items: TimelineItem[], now = new Date()): Standing {
  const changes = items.filter((i) => !i.isStart);
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  // When recording began, not the date printed on an old document someone shared.
  const starts = items
    .filter((i) => i.isStart)
    .map((i) => i.recordedAt ?? i.date)
    .sort();
  return {
    documents: platform.documents.length,
    trackedSince: starts[0] ?? null,
    changes: changes.length,
    lastChange: changes[0]?.date ?? null,
    changesInLastYear: changes.filter((c) => c.date >= yearAgo).length,
    sharedPrivately: changes.filter((c) => c.method === "submission").length,
    summaries: {
      reviewed: changes.filter((c) => c.summary && (c.summary.reviewed || !c.summary.byAi)).length,
      aiDrafts: changes.filter((c) => c.summary?.byAi && !c.summary.reviewed).length,
      none: changes.filter((c) => !c.summary).length,
    },
  };
}

/** Who wrote a summary, said before the summary itself. */
export function summarySource(summary: ChangeSummary): string {
  return !summary.byAi ? "Summary written by an editor" : summary.reviewed ? "AI summary, checked by an editor" : "AI draft, not yet checked by an editor";
}

export const METHOD_NOTE: Record<CaptureMethod, string> = {
  auto: "found on the public page",
  manual: "captured by hand",
  submission: "shared privately by a clinician",
};
