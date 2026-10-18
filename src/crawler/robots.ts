import robotsParser from "robots-parser";
import type { CheckOutcome } from "../core/records.ts";
import { FetchError, safeFetch, USER_AGENT_TOKEN } from "./fetch.ts";

type Verdict = { allowed: true } | { allowed: false; outcome: CheckOutcome; reason: string };

/** Caches robots.txt per origin for the length of one crawler run. */
export class RobotsCache {
  private readonly cache = new Map<string, Promise<(url: string) => Verdict>>();

  check(url: string, allowedHosts: Set<string>): Promise<Verdict> {
    const { origin, hostname } = new URL(url);
    // robots.txt often redirects between example.com and www.example.com, so both are allowed for it.
    const hosts = new Set([...allowedHosts, hostname, hostname.startsWith("www.") ? hostname.slice(4) : `www.${hostname}`]);
    // Keyed on the hosts too: documents on one site can allow different redirects.
    const key = `${origin} ${[...hosts].sort().join(",")}`;
    let rules = this.cache.get(key);
    if (!rules) {
      rules = this.load(origin, hosts);
      this.cache.set(key, rules);
    }
    return rules.then((isAllowed) => isAllowed(url));
  }

  private async load(origin: string, allowedHosts: Set<string>): Promise<(url: string) => Verdict> {
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const res = await safeFetch(robotsUrl, { allowedHosts, accept: "text" });
      if (res.status >= 500) {
        // The site is having trouble; be polite and try again next run.
        return () => ({ allowed: false, outcome: "fetch-failed", reason: `robots.txt returned HTTP ${res.status}` });
      }
      if (res.status >= 400) return () => ({ allowed: true }); // no robots.txt
      const robots = robotsParser(robotsUrl, res.body);
      return (url) =>
        robots.isAllowed(url, USER_AGENT_TOKEN) === false
          ? { allowed: false, outcome: "robots-disallowed", reason: "robots.txt disallows this URL" }
          : { allowed: true };
    } catch (error) {
      if (error instanceof FetchError && error.kind === "blocked") {
        return () => ({ allowed: false, outcome: "blocked", reason: "Blocked by bot protection" });
      }
      // Network trouble is not a refusal; report it as a failed fetch and retry next run.
      return () => ({
        allowed: false,
        outcome: "fetch-failed",
        reason: `Could not read robots.txt: ${(error as Error).message}`,
      });
    }
  }
}
