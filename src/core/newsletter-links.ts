import { createHmac, timingSafeEqual } from "node:crypto";
import { dataKey } from "./seal.ts";

/*
 * Signed links for the newsletter. A link proves its holder received an
 * email at that address, so nothing secret needs storing: the signature is
 * an HMAC with FINEPRINT_DATA_KEY. Raising a subscriber's tokenVersion makes
 * every earlier link stop working.
 *
 *   confirm: add one platform. Expires after 7 days.
 *   manage:  change platforms or unsubscribe. Included in every email.
 */

export type LinkPayload =
  | { k: "confirm"; s: string; v: number; p: string; e: number }
  | { k: "manage"; s: string; v: number };

const CONFIRM_DAYS = 7;

function sign(body: string): string {
  return createHmac("sha256", dataKey()).update(`fineprint-newsletter:${body}`).digest("base64url");
}

function encode(payload: LinkPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function confirmToken(subscriberId: string, version: number, platform: string, now = Date.now()): string {
  return encode({ k: "confirm", s: subscriberId, v: version, p: platform, e: Math.floor(now / 1000) + CONFIRM_DAYS * 86_400 });
}

export function manageToken(subscriberId: string, version: number): string {
  return encode({ k: "manage", s: subscriberId, v: version });
}

/** The payload of a genuine, unexpired link, or null. Checks the signature in constant time. */
export function readToken(token: string, now = Date.now()): LinkPayload | null {
  if (typeof token !== "string" || token.length > 600) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: LinkPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!/^[a-f0-9]{24}$/.test(payload?.s ?? "") || !Number.isInteger(payload.v)) return null;
  if (payload.k === "confirm") {
    if (typeof payload.p !== "string" || typeof payload.e !== "number" || payload.e * 1000 < now) return null;
    return payload;
  }
  return payload.k === "manage" ? payload : null;
}
