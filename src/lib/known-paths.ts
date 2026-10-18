import { ObjectId } from "mongodb";
import { COLLECTIONS, type PlatformRecord, type VersionRecord } from "@/core/records.ts";
import { getDb } from "./mongo.ts";

/*
 * Which platform and document addresses exist, for the proxy's 404 check.
 * Kept in memory for 30 seconds (on globalThis, so an admin edit in the same
 * process can clear it), so the proxy rarely touches the database.
 */
const TTL_MS = 30_000;
const store = globalThis as unknown as { fineprintPaths?: { at: number; paths: Promise<Set<string>> } };

async function load(): Promise<Set<string>> {
  const rows = await (await getDb())
    .collection<PlatformRecord>(COLLECTIONS.platforms)
    .find({}, { projection: { "documents.slug": 1 } })
    .toArray();
  return new Set(rows.flatMap((p) => [p._id, ...(p.documents ?? []).map((d) => `${p._id}/${d.slug}`)]));
}

/** True, false, or null when the database could not be reached (let the page decide). */
export async function isKnownPath(platform: string, document?: string): Promise<boolean | null> {
  const now = Date.now();
  if (!store.fineprintPaths || now - store.fineprintPaths.at > TTL_MS) {
    const paths = load();
    store.fineprintPaths = { at: now, paths };
    paths.catch(() => {
      store.fineprintPaths = undefined;
    });
  }
  try {
    const paths = await store.fineprintPaths.paths;
    return paths.has(document === undefined ? platform : `${platform}/${document}`);
  } catch {
    return null;
  }
}

export function forgetKnownPaths(): void {
  store.fineprintPaths = undefined;
}

/*
 * Which version ids exist. Versions are never deleted, so a "yes" can be kept
 * for as long as the process lives; a "no" is kept briefly, in case the
 * version is being written right now. The map is capped so random ids
 * can't grow it without limit.
 */
const NEGATIVE_TTL_MS = 30_000;
const MAX_VERSION_ENTRIES = 5_000;
const versionStore = globalThis as unknown as { fineprintVersions?: Map<string, { at: number; exists: boolean }> };

/** True, false, or null when the database could not be reached. */
export async function isKnownVersion(platform: string, document: string, id: string): Promise<boolean | null> {
  const key = `${platform}/${document}/${id}`;
  const cache = (versionStore.fineprintVersions ??= new Map());
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && (hit.exists || now - hit.at < NEGATIVE_TTL_MS)) return hit.exists;
  try {
    const row = await (await getDb())
      .collection<VersionRecord>(COLLECTIONS.versions)
      .findOne({ _id: new ObjectId(id), platform, document }, { projection: { _id: 1 } });
    if (cache.size >= MAX_VERSION_ENTRIES) cache.clear();
    cache.set(key, { at: now, exists: row !== null });
    return row !== null;
  } catch {
    return null;
  }
}
