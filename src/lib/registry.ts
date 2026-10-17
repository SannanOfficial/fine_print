import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { findDocument, findPlatform, type Platform } from "@/core/platforms.ts";
import { COLLECTIONS, type PlatformRecord } from "@/core/records.ts";
import { getDb } from "./db.ts";

/*
 * The tracked platforms, read from the database. Cached like the rest of the
 * public record; admin edits refresh it at once with updateTag("registry").
 * Callers must be behind connection() so this never runs during `next build`.
 */

export function toPlatform(r: PlatformRecord): Platform {
  return { slug: r._id, name: r.name, kind: r.kind, website: r.website, documents: r.documents ?? [] };
}

export async function getPlatforms(): Promise<Platform[]> {
  "use cache";
  cacheLife("record");
  cacheTag("registry");

  const rows = await (await getDb())
    .collection<PlatformRecord>(COLLECTIONS.platforms)
    .find({}, { sort: { order: 1, _id: 1 } })
    .toArray();
  return rows.map(toPlatform);
}

export async function getPlatform(slug: string): Promise<Platform | undefined> {
  return findPlatform(await getPlatforms(), slug);
}

export async function getDocument(platformSlug: string, documentSlug: string) {
  return findDocument(await getPlatforms(), platformSlug, documentSlug);
}
