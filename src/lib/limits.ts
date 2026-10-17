import "server-only";
import { headers } from "next/headers";
import { COLLECTIONS, type RateLimitRecord } from "@/core/records.ts";
import { getDb } from "./db.ts";
import { keyedHash } from "./seal.ts";

/**
 * The visitor's IP address as reported by the reverse proxy. The proxy must
 * overwrite (not append to) X-Real-IP / X-Forwarded-For; see README.md.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

/**
 * Count one event against a fixed-window limit. Returns false once `max`
 * events have happened in the current window. Keys are hashed before
 * storage; counters expire on their own.
 */
export async function withinLimit(bucket: string, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const id = `${bucket}:${keyedHash(key)}:${window}`;
  const row = await (await getDb())
    .collection<RateLimitRecord>(COLLECTIONS.rateLimits)
    .findOneAndUpdate(
      { _id: id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 1) * windowSeconds * 1000) } },
      { upsert: true, returnDocument: "after" },
    );
  return (row?.count ?? 1) <= max;
}
