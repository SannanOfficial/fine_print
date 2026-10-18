import type { Collection, ObjectId } from "mongodb";
import type { ChangeSummaryRecord, PlatformRecord, VersionRecord } from "../core/records.ts";
import { DEFAULT_MODEL, generateSummary } from "../core/summarize.ts";

/** The collections a summary needs. The crawler and the website both pass theirs. */
type SummaryCollections = {
  platforms: Collection<PlatformRecord>;
  versions: Collection<VersionRecord>;
  summaries: Collection<ChangeSummaryRecord>;
};

export type SummaryResult = "written" | "kept" | "skipped" | "not-configured";

/**
 * Write an AI summary for a changed version. An admin's reviewed or hidden
 * summary is never overwritten unless `force` is set.
 */
export async function summarizeVersion(c: SummaryCollections, id: ObjectId, { force = false } = {}): Promise<SummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "not-configured";

  const version = await c.versions.findOne({ _id: id });
  if (!version?.previousId) return "skipped"; // first copies have nothing to compare
  const existing = await c.summaries.findOne({ _id: id }, { projection: { state: 1 } });
  if (existing && existing.state !== "automatic" && !force) return "kept";

  // Only links or formatting changed: there is no wording to summarise.
  const stats = version.stats;
  if (stats && stats.added + stats.removed + stats.changed === 0) return "skipped";
  const previous = await c.versions.findOne({ _id: version.previousId });
  const platform = await c.platforms.findOne({ _id: version.platform });
  const document = platform?.documents.find((d) => d.slug === version.document);
  if (!previous || !platform || !document) return "skipped";

  const summary = await generateSummary({
    platformName: platform.name,
    documentTitle: document.title,
    before: previous.content,
    after: version.content,
    apiKey,
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
  });
  const now = new Date();
  const fields = {
    platform: version.platform,
    document: version.document,
    headline: summary.headline,
    points: summary.points,
    state: "automatic" as const,
    model: summary.model,
    generatedAt: now,
    updatedAt: now,
    updatedBy: null,
  };
  if (force) {
    await c.summaries.updateOne({ _id: id }, { $set: fields }, { upsert: true });
    return "written";
  }
  // The model call takes a while. If an editor reviewed or hid the summary in
  // the meantime, their version stays.
  const updated = await c.summaries.updateOne({ _id: id, state: "automatic" }, { $set: fields });
  if (updated.matchedCount > 0) return "written";
  try {
    await c.summaries.insertOne({ _id: id, ...fields });
    return "written";
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return "kept";
    throw error;
  }
}

/** Same as summarizeVersion, but logs instead of throwing: a failed summary must never fail a crawl. */
export async function trySummarize(c: SummaryCollections, id: ObjectId, name: string): Promise<void> {
  try {
    const result = await summarizeVersion(c, id);
    if (result === "written") console.log(`${name}: summary written`);
    if (result === "not-configured") console.log(`${name}: no summary (OPENAI_API_KEY is not set)`);
  } catch (error) {
    console.error(`${name}: summary failed (${(error as Error).message}). Retry with: npm run summarize`);
  }
}
