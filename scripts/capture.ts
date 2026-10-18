/**
 * Record a document from a page saved in a browser, for sites the crawler
 * cannot fetch (bot protection, or text that only appears after JavaScript).
 *
 *   1. Open the document in your browser and save it ("Save page as…",
 *      "Webpage, HTML only").
 *   2. npm run capture -- headway/terms-of-service ~/Downloads/terms.html
 *      Add --dry-run to preview the extracted text without saving.
 *      Add --url <https://…> if the document's URL is not in the registry yet.
 *
 * The saved file is only parsed as text. Nothing in it is executed.
 * The same can be done from the website, at /admin/platforms.
 */
import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { findDocument } from "../src/core/platforms.ts";
import { collections, connectWriter, acquireLock, loadPlatforms, releaseLock } from "../src/crawler/db.ts";
import { looksTruncated, sameWording } from "../src/crawler/check.ts";
import { ExtractionError, extractDocument } from "../src/crawler/extract.ts";
import { decodeBody } from "../src/crawler/fetch.ts";
import { latestVersion, recordCheck, saveVersion } from "../src/crawler/record.ts";
import { trySummarize } from "../src/crawler/summary.ts";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { "dry-run": { type: "boolean", default: false }, force: { type: "boolean", default: false }, url: { type: "string" } },
});

const [target, file] = positionals;
const [platformSlug, documentSlug] = (target ?? "").split("/");
if (!platformSlug || !documentSlug || !file) {
  console.error("Usage: npm run capture -- <platform>/<document> <saved-page.html> [--url https://…] [--dry-run] [--force]");
  process.exit(1);
}

const { client, db } = await connectWriter();
const c = collections(db);
const found = findDocument(await loadPlatforms(c), platformSlug, documentSlug);
if (!found) {
  console.error(`Unknown document "${target}". Add it at /admin/platforms first.`);
  await client.close();
  process.exit(1);
}

const sourceUrl = args.url ?? found.document.url;
if (!sourceUrl || new URL(sourceUrl).protocol !== "https:") {
  console.error("This document has no https address yet. Add it at /admin/platforms, or pass one with --url.");
  await client.close();
  process.exit(1);
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
if ((await stat(file)).size > MAX_FILE_BYTES) {
  console.error("That file is larger than 10 MB. Save the page as “HTML only”.");
  await client.close();
  process.exit(1);
}

let content: string;
try {
  // Saved pages keep their original encoding, which isn't always UTF-8.
  content = extractDocument(decodeBody(await readFile(file), ""), found.document).content;
} catch (error) {
  if (error instanceof ExtractionError) {
    console.error(`Could not find the document text: ${error.message}`);
    await client.close();
    process.exit(1);
  }
  throw error;
}

console.log(`Extracted ${content.length} characters.\n`);
console.log(content.slice(0, 800) + "\n…");

if (args["dry-run"]) {
  await client.close();
  process.exit(0);
}

const holder = `capture-${process.pid}`;
if (!(await acquireLock(c, holder, 5 * 60_000))) {
  console.error("A crawl is running right now. Try again in a few minutes.");
  await client.close();
  process.exit(1);
}
try {
  // The same checks as the crawler and the admin form.
  const previous = await latestVersion(c, found.platform.slug, found.document.slug);
  if (previous && previous.content !== content && sameWording(previous.content, content)) {
    console.log("\nThe wording is the same as the latest version; only link addresses, typography or formatting differ. Nothing saved.");
  } else if (looksTruncated(previous?.content, content) && !args.force) {
    console.error(
      `\nThe text is less than half the length of the latest version (${content.length} vs ${previous!.content.length} characters). ` +
        "Check the saved page, or pass --force to save it anyway.",
    );
    process.exitCode = 1;
  } else {
    const at = new Date();
    const { outcome, id } = await saveVersion(c, {
      platform: found.platform.slug,
      document: found.document.slug,
      content,
      sourceUrl,
      method: "manual",
      at,
      expectedPreviousId: previous?._id ?? null,
    });
    await recordCheck(c, { platform: found.platform.slug, document: found.document.slug, outcome, detail: null, at, durationMs: 0 });
    console.log(`\nSaved: ${outcome}.`);
    if (outcome === "changed") await trySummarize(c, id, `${found.platform.slug}/${found.document.slug}`);
  }
} finally {
  await releaseLock(c, holder);
  await client.close();
}
