import { type Collection, ObjectId } from "mongodb";
import { diffDocuments, summarize } from "../core/diff.ts";
import { documentKey } from "../core/platforms.ts";
import type { CaptureMethod, CheckOutcome, CheckRecord, StatusRecord, VersionRecord } from "../core/records.ts";
import { sha256 } from "../core/hash.ts";

/*
 * Shared by the crawler, the capture script and the admin pages, so each
 * passes in just the collections these need.
 */
type Versions = { versions: Collection<VersionRecord> };
type Checks = { checks: Collection<CheckRecord>; status: Collection<StatusRecord> };

/** Thrown when another version of the same document was saved at the same moment. */
export class ConcurrentVersionError extends Error {}

export async function latestVersion(c: Versions, platform: string, document: string) {
  return c.versions.findOne({ platform, document }, { sort: { capturedAt: -1, _id: -1 } });
}

/**
 * Save `content` as the newest version of a document, unless it matches the
 * newest version already stored. Returns what happened.
 *
 * Versions are only ever inserted. A unique index on (platform, document,
 * previousId) means two saves racing each other cannot both succeed: the
 * loser gets ConcurrentVersionError and nothing is written.
 */
export async function saveVersion(
  c: Versions,
  input: {
    platform: string;
    document: string;
    content: string;
    sourceUrl: string | null;
    method: CaptureMethod;
    at: Date;
    recordedBy?: string;
    /** The date on the document itself (YYYY-MM-DD), when an editor gives one. */
    datedOn?: string | null;
    /** Update the latest version's "still published" date when nothing changed. The website can't, and skips it. */
    touchUnchanged?: boolean;
  },
): Promise<{ outcome: "first-capture" | "changed" | "unchanged"; id: ObjectId; at: Date }> {
  const hash = sha256(input.content);
  const previous = await latestVersion(c, input.platform, input.document);

  if (previous && previous.hash === hash) {
    if (input.touchUnchanged !== false) {
      await c.versions.updateOne({ _id: previous._id }, { $max: { lastSeenAt: input.at } });
    }
    return { outcome: "unchanged", id: previous._id, at: input.at };
  }

  const id = new ObjectId();
  const savedAt = new Date(Math.max(Date.now(), (previous?.capturedAt.getTime() ?? 0) + 1));
  try {
    await c.versions.insertOne({
      _id: id,
      platform: input.platform,
      document: input.document,
      content: input.content,
      hash,
      // The time of saving, not of the fetch: the crawler waits between fetches,
      // and a version must never be dated before the one it follows.
      capturedAt: savedAt,
      lastSeenAt: savedAt,
      sourceUrl: input.sourceUrl,
      method: input.method,
      previousId: previous?._id ?? null,
      stats: previous ? summarize(diffDocuments(previous.content, input.content)) : null,
      ...(input.recordedBy ? { recordedBy: input.recordedBy } : {}),
      ...(input.datedOn ? { datedOn: input.datedOn } : {}),
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new ConcurrentVersionError("Another version of this document was saved at the same moment.");
    }
    throw error;
  }
  return { outcome: previous ? "changed" : "first-capture", id, at: savedAt };
}

const FAILURES: CheckOutcome[] = ["blocked", "robots-disallowed", "extraction-failed", "fetch-failed", "unstable"];

export async function recordCheck(
  c: Checks,
  input: { platform: string; document: string; outcome: CheckOutcome; detail: string | null; at: Date; durationMs: number },
): Promise<void> {
  const failed = FAILURES.includes(input.outcome);
  await c.checks.insertOne({
    platform: input.platform,
    document: input.document,
    at: input.at,
    outcome: input.outcome,
    detail: input.detail,
    durationMs: input.durationMs,
  });
  await c.status.updateOne(
    { _id: documentKey(input.platform, input.document) },
    {
      $set: {
        platform: input.platform,
        document: input.document,
        lastCheckedAt: input.at,
        lastOutcome: input.outcome,
        lastError: failed ? input.detail : null,
        ...(failed ? {} : { lastSuccessAt: input.at, consecutiveFailures: 0 }),
      },
      ...(failed ? { $inc: { consecutiveFailures: 1 }, $setOnInsert: { lastSuccessAt: null } } : {}),
    },
    { upsert: true },
  );
}
