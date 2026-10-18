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
import { MongoNetworkError, MongoServerSelectionError } from "mongodb";
import { fetchDocument, label, looksTruncated, redirectedHome, sameText, sameWording } from "../src/crawler/check.ts";
import { acquireLock, collections, connectWriter, loadPlatforms, releaseLock } from "../src/crawler/db.ts";
import { ConcurrentVersionError, latestVersion, recordCheck, saveVersion } from "../src/crawler/record.ts";
import { RobotsCache } from "../src/crawler/robots.ts";
import { summarizeVersion, trySummarize } from "../src/crawler/summary.ts";

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
let dbDown = false;
const tally = new Map<string, string[]>();
const databaseDown = (error: unknown) => error instanceof MongoNetworkError || error instanceof MongoServerSelectionError;
try {
  for (const { platform, doc } of targets) {
    const name = label(platform, doc);
    const started = Date.now();
    const at = new Date();
    const done = async (outcome: Parameters<typeof recordCheck>[1]["outcome"], detail: string | null, when = at) => {
      tally.set(outcome, [...(tally.get(outcome) ?? []), name]);
      await recordCheck(c, { platform: platform.slug, document: doc.slug, outcome, detail, at: when, durationMs: Date.now() - started });
      console.log(`${name}: ${outcome}${detail ? ` (${detail})` : ""}`);
    };

    try {
      const first = await fetchDocument(doc, robots);
      if (!first.ok) {
        await done(first.outcome, first.detail);
        continue;
      }

      if (redirectedHome(doc.url!, first.finalUrl)) {
        await done("extraction-failed", `The page now redirects to ${first.finalUrl}; check the document's address`);
        continue;
      }

      const previous = await latestVersion(c, platform.slug, doc.slug);
      if (looksTruncated(previous?.content, first.content)) {
        await done("extraction-failed", `Text shrank from ${previous!.content.length} to ${first.content.length} characters`);
        continue;
      }

      if (previous && !sameText(previous.content, first.content)) {
        if (sameWording(previous.content, first.content)) {
          await c.versions.updateOne({ _id: previous._id }, { $max: { lastSeenAt: at } });
          await done("unchanged", "Only link addresses or formatting differ");
          continue;
        }
        await sleep(CONFIRM_DELAY_MS);
        const second = await fetchDocument(doc, robots);
        if (!second.ok || !sameWording(first.content, second.content)) {
          await done("unstable", "Text differed between two fetches; will try again next run");
          continue;
        }
      }

      let saved: Awaited<ReturnType<typeof saveVersion>>;
      try {
        saved = await saveVersion(c, {
          platform: platform.slug,
          document: doc.slug,
          content: first.content,
          sourceUrl: first.finalUrl,
          method: "auto",
          at,
          expectedPreviousId: previous?._id ?? null,
        });
      } catch (error) {
        if (!(error instanceof ConcurrentVersionError)) throw error;
        await done("unstable", "An editor recorded a version at the same moment; will check again next run");
        continue;
      }
      const { outcome, id } = saved;
      await done(outcome, null, saved.at);
      if (outcome === "changed") await trySummarize(c, id, name);
    } catch (error) {
      unexpected = true;
      if (databaseDown(error)) {
        // Nothing can be recorded, so stop rather than keep loading other sites for nothing.
        console.error(`${name}: the database can't be reached (${(error as Error).message}). Stopping this run.`);
        dbDown = true;
        break;
      }
      console.error(`${name}: unexpected error`, error);
      await done("fetch-failed", `Unexpected error: ${(error as Error).message}`).catch(() => {});
    }
    await sleep(PAUSE_MS);
  }

  // Summaries that failed earlier (an OpenAI outage, say) are retried here, a few per run.
  if (process.env.OPENAI_API_KEY && !dbDown) await fillMissingSummaries().catch((error) => console.error(`Could not retry missing summaries: ${(error as Error).message}`));
} finally {
  await releaseLock(c, holder).catch((error) => console.error(`Could not release the lock: ${(error as Error).message}`));
  await client.close();
}

const failures = ["blocked", "robots-disallowed", "extraction-failed", "fetch-failed", "unstable"];
const failed = failures.flatMap((o) => tally.get(o) ?? []);
const checked = [...tally.values()].reduce((n, v) => n + v.length, 0);
console.log(
  `${checked} of ${targets.length} checked: ` +
    [...tally.entries()].map(([outcome, names]) => `${names.length} ${outcome}${failures.includes(outcome) ? ` (${names.join(", ")})` : ""}`).join(", "),
);
// Every single site failing almost always means this server's network is down, which systemd should show.
const allFailed = checked > 0 && failed.length === checked && checked === targets.length && targets.length > 1;
process.exit(unexpected || allFailed ? 1 : 0);

async function fillMissingSummaries() {
  const recent = await c.versions
    .find({ previousId: { $ne: null } }, { projection: { _id: 1, platform: 1, document: 1, stats: 1 }, sort: { capturedAt: -1 }, limit: 50 })
    .toArray()
    // Changes to links or formatting only have no wording to summarise.
    .then((rows) => rows.filter((v) => !v.stats || v.stats.added + v.stats.removed + v.stats.changed > 0));
  if (recent.length === 0) return;
  const done = new Set((await c.summaries.find({ _id: { $in: recent.map((v) => v._id) } }, { projection: { _id: 1 } }).toArray()).map((s) => s._id.toHexString()));
  const missing = recent.filter((v) => !done.has(v._id.toHexString())).slice(0, 5);
  for (const v of missing) {
    try {
      const result = await summarizeVersion(c, v._id);
      if (result === "written") console.log(`${v.platform}/${v.document}: missing summary written`);
    } catch (error) {
      console.error(`${v.platform}/${v.document}: summary still failing (${(error as Error).message})`);
    }
  }
}
