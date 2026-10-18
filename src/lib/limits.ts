import "server-only";
import { headers } from "next/headers";
import { addressBlock } from "@/core/address.ts";
import { COLLECTIONS, type RateLimitRecord } from "@/core/records.ts";
import { getDb } from "./db.ts";
import { keyedHash } from "./seal.ts";

/**
 * The visitor's IP address, as our own reverse proxy reports it.
 *
 * By default this is the last X-Forwarded-For entry: the one added by the
 * proxy in front of the site. (Caddy replaces the header; nginx with
 * $proxy_add_x_forwarded_for appends to it.) Earlier entries, and headers such
 * as X-Real-IP that a proxy may pass through untouched, come from the visitor
 * and can be made up. Behind a CDN, set FINEPRINT_CLIENT_IP_HEADER to the
 * header it sets, for example cf-connecting-ip. See README.md, "Deploying".
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const name = process.env.FINEPRINT_CLIENT_IP_HEADER?.trim().toLowerCase() || "x-forwarded-for";
  const value = h.get(name) ?? "";
  const ip = (name === "x-forwarded-for" ? value.split(",").at(-1) : value)?.trim();
  return ip ? addressBlock(ip) : "unknown";
}

/**
 * Count one event against a fixed-window limit. Returns false once `max`
 * events have happened in the current window. Keys are hashed before
 * storage; counters expire on their own.
 */
function windowId(bucket: string, key: string, windowSeconds: number) {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  return { id: `${bucket}:${keyedHash(key)}:${window}`, window };
}

export async function withinLimit(bucket: string, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { id, window } = windowId(bucket, key, windowSeconds);
  const row = await (await getDb())
    .collection<RateLimitRecord>(COLLECTIONS.rateLimits)
    .findOneAndUpdate(
      { _id: id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 1) * windowSeconds * 1000) } },
      { upsert: true, returnDocument: "after" },
    );
  return (row?.count ?? 1) <= max;
}

/** Whether `max` events have already been counted in the current window, without counting one. */
export async function limitReached(bucket: string, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { id } = windowId(bucket, key, windowSeconds);
  const row = await (await getDb()).collection<RateLimitRecord>(COLLECTIONS.rateLimits).findOne({ _id: id });
  return (row?.count ?? 0) >= max;
}
