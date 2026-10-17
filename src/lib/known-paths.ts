import { COLLECTIONS, type PlatformRecord } from "@/core/records.ts";
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
