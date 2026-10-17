/**
 * Check every automatically tracked document and record any change.
 *
 *   npm run crawl                        check everything and save results
 *   npm run crawl -- --dry-run           fetch and extract only; print, save nothing
 *   npm run crawl -- --only grow-therapy only this platform (or platform/document)
 *   npm run crawl -- --jitter 30         wait a random 0–30 minutes first
 *
 * Meant to run from a scheduler (see deploy/). Exits non-zero only on
 * unexpected errors, not when a site is temporarily unreachable.
 */
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { fetchDocument, label, looksTruncated, sameText } from "../src/crawler/check.ts";
import { acquireLock, collections, connectWriter, loadPlatforms, releaseLock } from "../src/crawler/db.ts";
import { latestVersion, recordCheck, saveVersion } from "../src/crawler/record.ts";
import { RobotsCache } from "../src/crawler/robots.ts";
import { trySummarize } from "../src/crawler/summary.ts";

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    only: { type: "string" },
    jitter: { type: "string", default: "0" },
  },
});

/** Pause between requests so we never hammer a site. */
const PAUSE_MS = 4_000;
/** Before recording a change, wait and fetch again to rule out flukes such as A/B tests. */
const CONFIRM_DELAY_MS = Number(process.env.FINEPRINT_CONFIRM_DELAY_MS ?? 90_000);

const jitterMinutes = Math.max(0, Number(args.jitter) || 0);
if (jitterMinutes > 0 && !args["dry-run"]) await sleep(Math.random() * jitterMinutes * 60_000);

const { client, db } = await connectWriter();
const c = collections(db);
const platforms = await loadPlatforms(c);

const targets = platforms.flatMap((platform) =>
  platform.documents
    .filter((doc) => doc.mode === "auto" && doc.url)
    .filter((doc) => !args.only || args.only === platform.slug || args.only === label(platform, doc))
    .map((doc) => ({ platform, doc })),
);

if (targets.length === 0) {
  console.error(`Nothing to check${args.only ? ` for "${args.only}"` : ""}.${platforms.length === 0 ? " The platform list is empty: run npm run db:setup." : ""}`);
  await client.close();
  process.exit(1);
}

const robots = new RobotsCache();

if (args["dry-run"]) {
  for (const { platform, doc } of targets) {
    const result = await fetchDocument(doc, robots);
    if (result.ok) {
      console.log(`\n=== ${label(platform, doc)}  ok  ${result.content.length} chars via "${result.selector}"`);
      console.log(result.content.slice(0, 600));
      console.log("…\n" + result.content.slice(-300));
    } else {
      console.log(`\n=== ${label(platform, doc)}  ${result.outcome}: ${result.detail}`);
    }
    await sleep(PAUSE_MS);
  }
  await client.close();
  process.exit(0);
}

const holder = `${process.pid}@${new Date().toISOString()}`;

if (!(await acquireLock(c, holder, 60 * 60_000))) {
  console.log("Another crawl is already running. Exiting.");
  await client.close();
  process.exit(0);
}

let unexpected = false;
try {
  for (const { platform, doc } of targets) {
    const name = label(platform, doc);
    const started = Date.now();
    const at = new Date();
    const done = async (outcome: Parameters<typeof recordCheck>[1]["outcome"], detail: string | null) => {
      await recordCheck(c, { platform: platform.slug, document: doc.slug, outcome, detail, at, durationMs: Date.now() - started });
      console.log(`${name}: ${outcome}${detail ? ` (${detail})` : ""}`);
    };

    try {
      const first = await fetchDocument(doc, robots);
      if (!first.ok) {
        await done(first.outcome, first.detail);
        continue;
      }

      const previous = await latestVersion(c, platform.slug, doc.slug);
      if (looksTruncated(previous?.content, first.content)) {
        await done("extraction-failed", `Text shrank from ${previous!.content.length} to ${first.content.length} characters`);
        continue;
      }

      if (previous && !sameText(previous.content, first.content)) {
        await sleep(CONFIRM_DELAY_MS);
        const second = await fetchDocument(doc, robots);
        if (!second.ok || !sameText(first.content, second.content)) {
          await done("unstable", "Text differed between two fetches; will try again next run");
          continue;
        }
      }

      const { outcome, id } = await saveVersion(c, {
        platform: platform.slug,
        document: doc.slug,
        content: first.content,
        sourceUrl: doc.url!,
        method: "auto",
        at,
      });
      await done(outcome, null);
      if (outcome === "changed") await trySummarize(c, id, name);
    } catch (error) {
      unexpected = true;
      console.error(`${name}: unexpected error`, error);
      await done("fetch-failed", `Unexpected error: ${(error as Error).message}`).catch(() => {});
    }
    await sleep(PAUSE_MS);
  }
} finally {
  await releaseLock(c, holder);
  await client.close();
}

process.exit(unexpected ? 1 : 0);
