import type { Platform, TrackedDocument } from "../core/platforms.ts";
import type { CheckOutcome } from "../core/records.ts";
import { sha256 } from "../core/hash.ts";
import { compareKey, toBlocks } from "../core/text.ts";
import { ExtractionError, extractDocument } from "./extract.ts";
import { allowedHostsFor, FetchError, isHtml, isJson, safeFetch } from "./fetch.ts";
import type { RobotsCache } from "./robots.ts";

export type Fetched =
  | { ok: true; content: string; finalUrl: string; selector: string }
  | { ok: false; outcome: CheckOutcome; detail: string };

/** Fetch one document and extract its text. Never throws for expected failures. */
export async function fetchDocument(doc: TrackedDocument, robots: RobotsCache): Promise<Fetched> {
  if (!doc.url) return { ok: false, outcome: "fetch-failed", detail: "No URL configured" };
  const fetchUrl = doc.source === "zendesk-api" ? zendeskArticleApi(doc.url) : doc.url;
  if (!fetchUrl) return { ok: false, outcome: "fetch-failed", detail: "URL is not a Zendesk help-centre article" };
  const allowedHosts = allowedHostsFor(fetchUrl, doc.redirectHosts);

  const verdict = await robots.check(fetchUrl, allowedHosts);
  if (!verdict.allowed) return { ok: false, outcome: verdict.outcome, detail: verdict.reason };

  try {
    const api = doc.source === "zendesk-api";
    const res = await safeFetch(fetchUrl, { allowedHosts, accept: api ? "json" : "html" });
    if (res.status !== 200) return { ok: false, outcome: "fetch-failed", detail: `HTTP ${res.status}` };
    if (!(api ? isJson : isHtml)(res.contentType)) {
      return { ok: false, outcome: "fetch-failed", detail: `Unexpected content type: ${res.contentType}` };
    }
    const html = api ? zendeskArticleHtml(res.body) : res.body;
    if (html === null) return { ok: false, outcome: "extraction-failed", detail: "The article API returned no body" };
    const { content, selector } = extractDocument(html, doc);
    // Record the public page as the source, not the API address.
    return { ok: true, content, finalUrl: api ? doc.url : res.finalUrl, selector };
  } catch (error) {
    if (error instanceof FetchError) {
      return { ok: false, outcome: error.kind === "blocked" ? "blocked" : "fetch-failed", detail: error.message };
    }
    if (error instanceof ExtractionError) return { ok: false, outcome: "extraction-failed", detail: error.message };
    throw error;
  }
}

/**
 * The public article API address for a Zendesk help-centre article URL, e.g.
 * https://help.example.com/hc/en-us/articles/123-Title
 *   → https://help.example.com/api/v2/help_center/en-us/articles/123.json
 */
export function zendeskArticleApi(articleUrl: string): string | null {
  const url = new URL(articleUrl);
  const match = url.pathname.match(/^\/hc\/([a-z]{2}(?:-[a-z0-9]+)?)\/articles\/(\d+)/i);
  if (url.protocol !== "https:" || !match) return null;
  return `${url.origin}/api/v2/help_center/${match[1].toLowerCase()}/articles/${match[2]}.json`;
}

/**
 * The article body from the API's JSON, wrapped the way the help-centre page
 * wraps it, so the document's usual selectors extract the same text.
 */
export function zendeskArticleHtml(json: string): string | null {
  let body: unknown;
  try {
    body = (JSON.parse(json) as { article?: { body?: unknown } }).article?.body;
  } catch {
    return null;
  }
  if (typeof body !== "string" || !body.trim()) return null;
  return `<!doctype html><html><body><article><div itemprop="articleBody">${body}</div></article></body></html>`;
}

/**
 * Decide whether a fetched text is a trustworthy new version.
 *
 * A sudden large drop in length usually means the page layout changed and our
 * selector now grabs the wrong element, so we flag it instead of recording a
 * misleading "change".
 */
export function looksTruncated(previous: string | undefined, next: string): boolean {
  return previous !== undefined && next.length < previous.length * 0.5;
}

export const sameText = (a: string, b: string) => sha256(a) === sha256(b);

/**
 * Same readable wording, ignoring link addresses and inline formatting, which
 * the redline doesn't show either. Tracking links and signed image addresses
 * that change on every load must not count as a change to the terms.
 */
export const sameWording = (a: string, b: string) => toBlocks(a).map(compareKey).join("\n") === toBlocks(b).map(compareKey).join("\n");

/** A terms page that now redirects to the site's home page has moved or gone. */
export function redirectedHome(configured: string, final: string): boolean {
  const from = new URL(configured);
  const to = new URL(final);
  return from.pathname.replace(/\/+$/, "") !== "" && to.pathname.replace(/\/+$/, "") === "";
}

export function label(platform: Platform, doc: TrackedDocument): string {
  return `${platform.slug}/${doc.slug}`;
}
