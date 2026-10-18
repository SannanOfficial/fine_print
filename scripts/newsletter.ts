/**
 * Send the weekly email: each subscriber gets the changes recorded since
 * their last email on the platforms they follow, with the AI summary of each.
 * Subscribers with nothing new get nothing.
 *
 *   npm run newsletter                 send
 *   npm run newsletter -- --dry-run    show who would get what; send and change nothing
 *
 * Needs MONGODB_WRITE_URI, FINEPRINT_DATA_KEY (to read addresses), MAIL_FROM
 * and SMTP_URL (or MAIL_OUTBOX_DIR to write emails to a folder instead).
 * Meant to run weekly from a scheduler (see deploy/).
 */
import { parseArgs } from "node:util";
import { mailConfigured, siteUrl as siteUrlFor } from "../src/core/mailer.ts";
import { acquireLock, collections, connectWriter, releaseLock } from "../src/crawler/db.ts";
import { runDigest } from "../src/crawler/newsletter.ts";

const { values: args } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
const dryRun = args["dry-run"];

if (!process.env.FINEPRINT_DATA_KEY) {
  console.error("FINEPRINT_DATA_KEY is not set: it is needed to read subscribers' addresses.");
  process.exit(1);
}
if (!dryRun && !mailConfigured()) {
  console.error("Email is not set up. Set MAIL_FROM, FINEPRINT_SITE_URL and SMTP_URL (or MAIL_OUTBOX_DIR for testing).");
  process.exit(1);
}

const siteUrl = siteUrlFor() ?? "http://localhost:3000";
const { client, db } = await connectWriter();
const c = collections(db);
const holder = `newsletter-${process.pid}`;

if (!dryRun && !(await acquireLock(c, holder, 60 * 60_000, "newsletter"))) {
  console.log("Another newsletter run is in progress. Exiting.");
  await client.close();
  process.exit(0);
}
try {
  const r = await runDigest(c, { dryRun, siteUrl });
  console.log(`${dryRun ? "Dry run: would send" : "Sent"} ${r.sent}, nothing new for ${r.nothingNew}, failed ${r.failed}.`);
  process.exitCode = r.failed > 0 ? 1 : 0;
} finally {
  if (!dryRun) await releaseLock(c, holder, "newsletter");
  await client.close();
}
