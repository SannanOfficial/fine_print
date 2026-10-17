import dns, { type LookupAddress } from "node:dns";
import type { IncomingHttpHeaders } from "node:http";
import https from "node:https";
import net, { type LookupFunction } from "node:net";
import zlib from "node:zlib";

/**
 * A deliberately narrow HTTP client for fetching public terms pages.
 *
 * - https only, and redirects may only go to hosts the document allows
 * - public internet addresses only: never this machine or a private network,
 *   whatever an address in the platform list says
 * - hard limits on time, redirects and response size
 * - never runs page JavaScript: we only read the HTML the server sends
 */

export const USER_AGENT_TOKEN = "FinePrintBot";

export function userAgent(): string {
  const site = process.env.FINEPRINT_SITE_URL ?? "https://fineprint.syedsannan.com";
  return `Mozilla/5.0 (compatible; ${USER_AGENT_TOKEN}/0.1; +${site}/about)`;
}

const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 5 * 1024 * 1024;

export class FetchError extends Error {
  readonly kind: "blocked" | "failed";
  constructor(kind: "blocked" | "failed", message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface FetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
}

interface FetchOptions {
  allowedHosts: Set<string>;
  accept: "html" | "text" | "json";
}

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

function header(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name];
  return Array.isArray(value) ? value.join(", ") : (value ?? "");
}

/** Address ranges the crawler must never connect to. */
const PRIVATE = new net.BlockList();
for (const [range, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) {
  PRIVATE.addSubnet(range, bits, "ipv4");
}
for (const [range, bits] of [
  ["::", 127], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2001:db8::", 32],
] as const) {
  PRIVATE.addSubnet(range, bits, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return false;
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    return !PRIVATE.check(address, "ipv6");
  }
  return !PRIVATE.check(address, "ipv4");
}

/** DNS lookup that refuses names resolving to any private address. */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list = addresses as unknown as LookupAddress[];
    const blocked = list.find((a) => !isPublicAddress(a.address));
    if (blocked || list.length === 0) {
      const reason = new FetchError("failed", `Refusing to connect to a non-public address (${blocked?.address ?? "none"})`);
      return callback(reason, "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    return callback(null, list[0].address, list[0].family);
  });
};

/**
 * One GET request with node:https. We avoid the built-in fetch here because
 * it sends browser-only headers (such as Sec-Fetch-Mode) that some bot
 * filters reject, even for an honest, clearly identified crawler.
 */
function get(url: URL, accept: string, signal: AbortSignal): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        signal,
        lookup: publicOnlyLookup,
        headers: {
          "User-Agent": userAgent(),
          Accept: accept,
          "Accept-Language": "en-US,en;q=0.8",
          // No Accept-Encoding: some bot filters flag "gzip, br" from non-browsers.
          // Terms pages are small, so uncompressed responses are fine.
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, headers: res.headers, body: "" });
          return;
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > MAX_BYTES) {
          res.destroy();
          reject(new FetchError("failed", `Response too large (${declared} bytes)`));
          return;
        }

        const encoding = header(res.headers, "content-encoding").toLowerCase();
        const stream =
          encoding === "gzip" ? res.pipe(zlib.createGunzip()) : encoding === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;

        const chunks: Buffer[] = [];
        let total = 0;
        stream.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > MAX_BYTES) {
            res.destroy();
            stream.destroy();
            reject(new FetchError("failed", `Response exceeded ${MAX_BYTES} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
        stream.on("error", (error) => reject(new FetchError("failed", `Read error: ${error.message}`)));
      },
    );
    req.on("error", (error) => reject(new FetchError("failed", `Network error: ${error.message}`)));
  });
}

function looksLikeBotChallenge(res: RawResponse): boolean {
  if (header(res.headers, "cf-mitigated") === "challenge") return true;
  if (res.status !== 403 && res.status !== 429 && res.status !== 503) return false;
  return /cloudflare|just a moment|attention required|captcha|access denied/i.test(res.body.slice(0, 5000));
}

export async function safeFetch(url: string, options: FetchOptions): Promise<FetchResult> {
  let current = new URL(url);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const accept = {
    html: "text/html,application/xhtml+xml",
    text: "text/plain",
    json: "application/json",
  }[options.accept];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "https:") throw new FetchError("failed", `Refusing non-https URL: ${current}`);
    if (!options.allowedHosts.has(current.hostname)) {
      throw new FetchError("failed", `Redirect to unexpected host: ${current.hostname}`);
    }
    // Addresses written as numbers skip DNS, so check them here.
    const literal = current.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(literal) && !isPublicAddress(literal)) {
      throw new FetchError("failed", `Refusing to connect to a non-public address (${literal})`);
    }

    const res = await get(current, accept, signal);
    const location = header(res.headers, "location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current);
      continue;
    }
    if (looksLikeBotChallenge(res)) {
      throw new FetchError("blocked", `Blocked by bot protection (HTTP ${res.status})`);
    }
    return { finalUrl: current.toString(), status: res.status, contentType: header(res.headers, "content-type"), body: res.body };
  }
  throw new FetchError("failed", `Too many redirects from ${url}`);
}

export function allowedHostsFor(url: string, extra: string[] = []): Set<string> {
  return new Set([new URL(url).hostname, ...extra]);
}

export function isJson(contentType: string): boolean {
  return /^application\/json\b/i.test(contentType.trim());
}

export function isHtml(contentType: string): boolean {
  return /^(text\/html|application\/xhtml\+xml)\b/i.test(contentType.trim());
}
