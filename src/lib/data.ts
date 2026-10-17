import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { ObjectId } from "mongodb";
import {
  COLLECTIONS,
  type ChangeStats,
  type ChangeSummaryRecord,
  type CheckOutcome,
  type StatusRecord,
  type VersionRecord,
} from "@/core/records.ts";
import { getDb } from "./db.ts";

/*
 * Read-only queries for the public site. (Admin queries are in admin-data.ts.)
 *
 * Every function here is cached for a few minutes ("record" profile in
 * next.config.ts) so traffic spikes from a shared link never reach the
 * database. Callers must be behind `connection()` so that the queries run
 * at request time and never during `next build`.
 *
 * Only fields that are safe to publish are returned. Internal error details
 * stay in the database.
 */

export interface PublicStatus {
  lastCheckedAt: string;
  lastOutcome: CheckOutcome;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
}

/** Plain-language summary of a change. Hidden summaries are never returned. */
export interface ChangeSummary {
  headline: string;
  points: string[];
  /** True once an admin has checked it; false while it is the AI's draft. */
  reviewed: boolean;
  /** False when an editor wrote it from scratch. */
  byAi: boolean;
}

export interface VersionSummary {
  id: string;
  platform: string;
  document: string;
  capturedAt: string;
  lastSeenAt: string;
  method: VersionRecord["method"];
  stats: ChangeStats | null;
  isFirst: boolean;
  summary: ChangeSummary | null;
}

export interface VersionText extends VersionSummary {
  content: string;
  sourceUrl: string | null;
}

const SUMMARY_FIELDS = {
  platform: 1,
  document: 1,
  capturedAt: 1,
  lastSeenAt: 1,
  method: 1,
  stats: 1,
  previousId: 1,
} as const;

type SummaryRecord = Pick<VersionRecord, "_id" | keyof typeof SUMMARY_FIELDS>;

function toSummary(v: SummaryRecord): VersionSummary {
  return {
    id: v._id.toHexString(),
    platform: v.platform,
    document: v.document,
    capturedAt: v.capturedAt.toISOString(),
    lastSeenAt: v.lastSeenAt.toISOString(),
    method: v.method,
    stats: v.stats,
    isFirst: v.previousId === null,
    summary: null,
  };
}

/** Fill in `summary` for each change that has a visible one. */
async function withSummaries<T extends VersionSummary>(list: T[]): Promise<T[]> {
  const ids = list.filter((v) => !v.isFirst).map((v) => new ObjectId(v.id));
  if (ids.length === 0) return list;
  const rows = await (await getDb())
    .collection<ChangeSummaryRecord>(COLLECTIONS.summaries)
    .find({ _id: { $in: ids }, state: { $ne: "hidden" } }, { projection: { headline: 1, points: 1, state: 1, model: 1 } })
    .toArray();
  const byId = new Map(rows.map((r) => [r._id.toHexString(), r]));
  return list.map((v) => {
    const s = byId.get(v.id);
    return s ? { ...v, summary: { headline: s.headline, points: s.points, reviewed: s.state === "reviewed", byAi: s.model !== null } } : v;
  });
}

function toText(v: VersionRecord): VersionText {
  return { ...toSummary(v), content: v.content, sourceUrl: v.sourceUrl };
}

async function versions() {
  return (await getDb()).collection<VersionRecord>(COLLECTIONS.versions);
}

/** Latest check result for every tracked document, keyed "platform/document". */
export async function getStatuses(): Promise<Record<string, PublicStatus>> {
  "use cache";
  cacheLife("record");
  cacheTag("status");

  const rows = await (await getDb())
    .collection<StatusRecord>(COLLECTIONS.status)
    .find({}, { projection: { lastCheckedAt: 1, lastOutcome: 1, lastSuccessAt: 1, consecutiveFailures: 1 } })
    .toArray();

  return Object.fromEntries(
    rows.map((s) => [
      s._id,
      {
        lastCheckedAt: s.lastCheckedAt.toISOString(),
        lastOutcome: s.lastOutcome,
        lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
        consecutiveFailures: s.consecutiveFailures ?? 0,
      },
    ]),
  );
}

/** Version history (without text), newest first. Optionally for one platform or document. */
export async function getHistory(platform?: string, document?: string): Promise<VersionSummary[]> {
  "use cache";
  cacheLife("record");
  cacheTag("versions", "summaries");

  const filter: Record<string, string> = {};
  if (platform) filter.platform = platform;
  if (document) filter.document = document;

  const rows = await (await versions())
    .find(filter, { projection: SUMMARY_FIELDS, sort: { capturedAt: -1, _id: -1 }, limit: 500 })
    .toArray();
  return withSummaries(rows.map(toSummary));
}

/** Most recent changes across all platforms (first captures excluded). */
export async function getRecentChanges(limit: number): Promise<VersionSummary[]> {
  "use cache";
  cacheLife("record");
  cacheTag("versions", "summaries");

  const rows = await (await versions())
    .find({ previousId: { $ne: null } }, { projection: SUMMARY_FIELDS, sort: { capturedAt: -1, _id: -1 }, limit })
    .toArray();
  return withSummaries(rows.map(toSummary));
}

export async function getLatestText(platform: string, document: string): Promise<VersionText | null> {
  "use cache";
  cacheLife("record");
  cacheTag("versions");

  const row = await (await versions()).findOne({ platform, document }, { sort: { capturedAt: -1, _id: -1 } });
  return row ? toText(row) : null;
}

/**
 * One version and the version before it. Returns null for ids that are
 * malformed or that belong to a different document.
 */
export async function getVersionPair(
  platform: string,
  document: string,
  id: string,
): Promise<{ version: VersionText; previous: VersionText | null } | null> {
  "use cache";
  cacheLife("record");
  cacheTag("versions", "summaries");

  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const col = await versions();
  const version = await col.findOne({ _id: new ObjectId(id), platform, document });
  if (!version) return null;
  const previous = version.previousId ? await col.findOne({ _id: version.previousId, platform, document }) : null;
  const [withSummary] = await withSummaries([toText(version)]);
  return { version: withSummary, previous: previous ? toText(previous) : null };
}
