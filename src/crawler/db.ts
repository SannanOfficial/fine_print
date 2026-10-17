import { MongoClient, type Db } from "mongodb";
import type { Platform } from "../core/platforms.ts";
import {
  COLLECTIONS,
  type AdminRecord,
  type ChangeSummaryRecord,
  type CheckRecord,
  type LockRecord,
  type PlatformRecord,
  type SessionRecord,
  type StatusRecord,
  type VersionRecord,
} from "../core/records.ts";

/**
 * Connect with the crawler's credentials (readWrite). The website uses a
 * separate, narrower user (MONGODB_SITE_URI) that can add versions but never
 * change or delete them.
 */
export async function connectWriter(): Promise<{ client: MongoClient; db: Db }> {
  const uri = process.env.MONGODB_WRITE_URI;
  if (!uri) throw new Error("MONGODB_WRITE_URI is not set. See .env.example.");
  const client = new MongoClient(uri, { appName: "fine-print-crawler", serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  return { client, db: client.db(process.env.MONGODB_DB ?? "fine_print") };
}

export function collections(db: Db) {
  return {
    platforms: db.collection<PlatformRecord>(COLLECTIONS.platforms),
    versions: db.collection<VersionRecord>(COLLECTIONS.versions),
    status: db.collection<StatusRecord>(COLLECTIONS.status),
    checks: db.collection<CheckRecord>(COLLECTIONS.checks),
    locks: db.collection<LockRecord>(COLLECTIONS.locks),
    summaries: db.collection<ChangeSummaryRecord>(COLLECTIONS.summaries),
    admins: db.collection<AdminRecord>(COLLECTIONS.admins),
    sessions: db.collection<SessionRecord>(COLLECTIONS.sessions),
  };
}

export type Collections = ReturnType<typeof collections>;

/** The tracked platforms, in display order. */
export async function loadPlatforms(c: Collections): Promise<Platform[]> {
  const rows = await c.platforms.find({}, { sort: { order: 1, _id: 1 } }).toArray();
  return rows.map((r) => ({ slug: r._id, name: r.name, kind: r.kind, website: r.website, documents: r.documents ?? [] }));
}

/** Take the crawler lock, or return false if another run holds it. */
export async function acquireLock(c: Collections, holder: string, ttlMs: number): Promise<boolean> {
  const now = new Date();
  try {
    await c.locks.updateOne(
      { _id: "crawler", lockedUntil: { $lt: now } },
      { $set: { holder, lockedUntil: new Date(now.getTime() + ttlMs) } },
      { upsert: true },
    );
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false; // held by someone else
    throw error;
  }
}

export async function releaseLock(c: Collections, holder: string): Promise<void> {
  await c.locks.deleteOne({ _id: "crawler", holder });
}
