import type { Platform } from "@/core/platforms.ts";
import type { CaptureMethod } from "@/core/records.ts";
import type { ChangeSummary, PublicEvent, VersionSummary } from "./data.ts";

/*
 * A company's record as one timeline: every change to every document it
 * asks clinicians to accept, and the events around them (a contract sent
 * privately, a rollout paused), newest first, each with its date. The page
 * and the PDF are both built from this, so they always agree.
 */

export interface TimelineItem {
  kind: "version";
  id: string;
  documentSlug: string;
  documentTitle: string;
  /** When the change happened, as best we know: the date on the document if an editor gave one, otherwise when it was recorded (or first archived). */
  date: string;
  /** Set when `date` came from the document and it was recorded on a different day. */
  recordedAt: string | null;
  /** The first copy of a document: when its record begins, not a change. */
  isStart: boolean;
  method: CaptureMethod;
  stats: VersionSummary["stats"];
  summary: ChangeSummary | null;
  href: string;
}

/** Something that happened, reported by the sources it cites. */
export interface TimelineEvent {
  kind: "event";
  id: string;
  date: string;
  precision: "day" | "month";
  title: string;
  body: string;
  sources: { label: string; url: string }[];
}

export type TimelineEntry = TimelineItem | TimelineEvent;

const dayOf = (iso: string) => iso.slice(0, 10);

export function buildTimeline(platform: Platform, history: VersionSummary[], events: PublicEvent[] = []): TimelineEntry[] {
  const titles = new Map(platform.documents.map((d) => [d.slug, d.title]));
  const versions: TimelineItem[] = history
    .filter((v) => v.platform === platform.slug && titles.has(v.document))
    .map((v) => ({
      kind: "version",
      id: v.id,
      documentSlug: v.document,
      documentTitle: titles.get(v.document)!,
      date: v.datedOn ? `${v.datedOn}T00:00:00.000Z` : v.capturedAt,
      recordedAt: v.datedOn && dayOf(v.capturedAt) !== v.datedOn ? v.capturedAt : null,
      isStart: v.isFirst,
      method: v.method,
      stats: v.stats,
      summary: v.summary,
      href: `/${v.platform}/${v.document}/${v.id}`,
    }));
  const happenings: TimelineEvent[] = events.map((e) => ({ kind: "event", ...e, date: `${e.date}T00:00:00.000Z` }));
  const order = (e: TimelineEntry) => (e.kind === "version" ? (e.recordedAt ?? e.date) : e.date);
  return [...versions, ...happenings].sort((a, b) => b.date.localeCompare(a.date) || order(b).localeCompare(order(a)));
}

/** Newest year first, each with its entries in timeline order. */
export function byYear<T extends { date: string }>(items: T[]): [string, T[]][] {
  const years = new Map<string, T[]>();
  for (const item of items) {
    const year = item.date.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), item]);
  }
  return [...years];
}

/** Plain facts about a company's record, for the overview. Fine Print reports them; it doesn't score them. */
export interface Standing {
  documents: number;
  /** When the record of this company begins: its earliest first copy (recorded, or first archived). */
  trackedSince: string | null;
  changes: number;
  lastChange: string | null;
  changesInLastYear: number;
  /** Changes known only because a clinician shared what the platform sent them. */
  sharedPrivately: number;
  /** Reported events on the timeline. */
  events: number;
  summaries: { reviewed: number; aiDrafts: number; none: number };
}

export function standingOf(platform: Platform, entries: TimelineEntry[], now = new Date()): Standing {
  const items = entries.filter((e): e is TimelineItem => e.kind === "version");
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
    events: entries.length - items.length,
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
  archive: "from the Internet Archive's copy",
};

const monthYear = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
/** An event's date as precisely as it's known: "Oct 16, 2026" or "April 2026". */
export function eventDate(e: Pick<TimelineEvent, "date" | "precision">, formatDay: (iso: string) => string): string {
  return e.precision === "month" ? monthYear.format(new Date(e.date)) : formatDay(e.date);
}
