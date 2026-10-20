/**
 * Imports a prepared slice of the record: document settings, version
 * histories (for example earlier versions recovered from the Internet
 * Archive), summaries of the changes and reported events.
 *
 *   npm run import -- plan.json --dry-run
 *   npm run import -- plan.json
 *
 * (On the server: node --env-file=/etc/fineprint/crawler.env scripts/import-record.ts plan.json)
 *
 * plan.json:
 *   documents: [{ platform, document: TrackedDocument }]  settings to add or replace
 *   histories: [{ platform, document, replace: true, versions: [{ content, capturedAt, lastSeenAt,
 *               method, sourceUrl, datedOn }] }], oldest first
 *   summaries: { "<platform>--<document>--<n>": { headline, points, model } }  for the change into version n
 *   events:    [{ platform, date, precision, title, body, sources: [{ label, url }] }]
 *
 * A history with `replace` takes the place of the document's versions so
 * far, so that earlier versions sit before the ones already recorded. Use it
 * only when importing, before anyone relies on those versions' addresses.
 * Running the same plan again keeps the versions (and their addresses) and
 * only refreshes AI summaries that no editor has touched.
 * Needs MONGODB_WRITE_URI (the crawler's read-write user).
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ObjectId } from "mongodb";
import { diffDocuments, summarize } from "../src/core/diff.ts";
import { sha256 } from "../src/core/hash.ts";
import { documentProblems, type TrackedDocument } from "../src/core/platforms.ts";
import type { CaptureMethod, VersionRecord } from "../src/core/records.ts";
import { acquireLock, collections, connectWriter, releaseLock } from "../src/crawler/db.ts";

const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { "dry-run": { type: "boolean", default: false } } });
const dryRun = args["dry-run"];
const plan = JSON.parse(readFileSync(positionals[0] ?? "plan.json", "utf8")) as {
  documents?: { platform: string; document: TrackedDocument }[];
  histories?: {
    platform: string;
    document: string;
    replace?: boolean;
    versions: { content: string; capturedAt: string; lastSeenAt: string; method: CaptureMethod; sourceUrl: string | null; datedOn: string | null }[];
  }[];
  summaries?: Record<string, { headline: string; points: string[]; model: string }>;
  events?: { platform: string; date: string; precision: "day" | "month"; title: string; body: string; sources: { label: string; url: string }[] }[];
};

const METHODS = new Set(["auto", "manual", "submission", "archive"]);
for (const h of plan.histories ?? []) {
  h.versions.forEach((v, i) => {
    if (!v.content?.trim()) throw new Error(`${h.platform}/${h.document} version ${i}: empty`);
    if (!METHODS.has(v.method)) throw new Error(`${h.platform}/${h.document} version ${i}: unknown method ${v.method}`);
    if (i > 0 && !(v.capturedAt > h.versions[i - 1].capturedAt)) throw new Error(`${h.platform}/${h.document} version ${i}: out of order`);
    if (v.datedOn && !/^\d{4}-\d{2}-\d{2}$/.test(v.datedOn)) throw new Error(`${h.platform}/${h.document} version ${i}: bad datedOn`);
  });
}
for (const e of plan.events ?? []) {
  const where = `event ${e.platform} ${e.date}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !["day", "month"].includes(e.precision)) throw new Error(`${where}: bad date or precision`);
  if (!e.title?.trim() || !e.body?.trim()) throw new Error(`${where}: needs a title and a body`);
  if (!e.sources?.length || e.sources.some((s) => !s.label?.trim() || !/^https:\/\/[^\s]+$/.test(s.url))) throw new Error(`${where}: every source needs a label and an https address`);
}
for (const d of plan.documents ?? []) {
  const problems = documentProblems(d.document);
  if (problems.length) throw new Error(`${d.platform}/${d.document.slug}: ${problems.join(" ")}`);
}

const { client, db } = await connectWriter();
const c = collections(db);
// The crawler's lock, so no crawl saves a version while histories are being replaced.
const holder = `import-${process.pid}-${Date.now()}`;
if (!dryRun && !(await acquireLock(c, holder, 15 * 60_000))) {
  await client.close();
  throw new Error("A crawl or capture is running. Try again when it has finished.");
}
try {
  const now = new Date();
  for (const { platform, document } of plan.documents ?? []) {
    const row = await c.platforms.findOne({ _id: platform });
    if (!row) throw new Error(`No platform ${platform}`);
    const exists = row.documents.some((d) => d.slug === document.slug);
    console.log(`${platform}/${document.slug}: ${exists ? "settings updated" : "document added"}`);
    if (dryRun) continue;
    if (exists) await c.platforms.updateOne({ _id: platform, "documents.slug": document.slug }, { $set: { "documents.$": document, updatedAt: now, updatedBy: "import" } });
    else await c.platforms.updateOne({ _id: platform }, { $push: { documents: document }, $set: { updatedAt: now, updatedBy: "import" } });
  }

  for (const h of plan.histories ?? []) {
    const name = `${h.platform}/${h.document}`;
    const existing = await c.versions
      .find({ platform: h.platform, document: h.document }, { projection: { _id: 1, hash: 1 }, sort: { capturedAt: 1, _id: 1 } })
      .toArray();
    // Already imported: keep the versions (and their addresses), and only refresh AI drafts no editor has touched.
    if (existing.length === h.versions.length && existing.every((v, i) => v.hash === sha256(h.versions[i].content))) {
      console.log(`${name}: already on the record; summaries refreshed where still unedited AI drafts`);
      if (dryRun) continue;
      for (const [i, v] of existing.entries()) {
        const summary = plan.summaries?.[`${h.platform}--${h.document}--${i}`];
        if (i === 0 || !summary) continue;
        await c.summaries.updateOne(
          { _id: v._id, state: "automatic", updatedBy: null },
          { $set: { headline: summary.headline, points: summary.points, model: summary.model, updatedAt: now } },
        );
      }
      continue;
    }
    if (existing.length && !h.replace) throw new Error(`${name} already has versions; set "replace" to put this history in their place`);
    console.log(`${name}: ${existing.length} existing version(s) ${existing.length ? "replaced by" : "→"} ${h.versions.length}`);
    if (dryRun) continue;
    if (existing.length) {
      const ids = existing.map((v) => v._id);
      await c.summaries.deleteMany({ _id: { $in: ids } });
      await c.versions.deleteMany({ _id: { $in: ids } });
    }
    let previous: VersionRecord | null = null;
    for (const [i, v] of h.versions.entries()) {
      const record: VersionRecord = {
        _id: new ObjectId(),
        platform: h.platform,
        document: h.document,
        content: v.content,
        hash: sha256(v.content),
        capturedAt: new Date(v.capturedAt),
        lastSeenAt: new Date(v.lastSeenAt),
        sourceUrl: v.sourceUrl,
        method: v.method,
        previousId: previous?._id ?? null,
        stats: previous ? summarize(diffDocuments(previous.content, v.content)) : null,
        recordedBy: "import",
        ...(v.datedOn ? { datedOn: v.datedOn } : {}),
      };
      await c.versions.insertOne(record);
      const summary = plan.summaries?.[`${h.platform}--${h.document}--${i}`];
      if (previous && summary) {
        await c.summaries.insertOne({
          _id: record._id,
          platform: h.platform,
          document: h.document,
          headline: summary.headline,
          points: summary.points,
          state: "automatic",
          model: summary.model,
          generatedAt: now,
          updatedAt: now,
          updatedBy: null,
        });
      }
      previous = record;
    }
  }

  for (const e of plan.events ?? []) {
    const already = await c.events.findOne({ platform: e.platform, date: e.date, title: e.title });
    console.log(`event ${e.platform} ${e.date} "${e.title}": ${already ? "already there" : "added"}`);
    if (dryRun || already) continue;
    await c.events.insertOne({ _id: new ObjectId(), ...e, createdAt: now, updatedAt: now, updatedBy: "import" });
  }
  console.log(dryRun ? "Dry run: nothing written." : "Imported.");
} finally {
  if (!dryRun) await releaseLock(c, holder);
  await client.close();
}
