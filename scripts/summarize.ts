/**
 * Write AI summaries for recorded changes.
 *
 *   npm run summarize                     every change that has no summary yet
 *   npm run summarize -- --id <versionId> one change (replaces an unreviewed summary)
 *   npm run summarize -- --id <id> --force  also replaces a summary an admin reviewed or hid
 *
 * Needs OPENAI_API_KEY (and optionally OPENAI_MODEL) and MONGODB_WRITE_URI.
 * The crawler calls the same code after every change it records.
 */
import { parseArgs } from "node:util";
import { ObjectId } from "mongodb";
import { collections, connectWriter } from "../src/crawler/db.ts";
import { summarizeVersion } from "../src/crawler/summary.ts";

const { values: args } = parseArgs({
  options: { id: { type: "string" }, force: { type: "boolean", default: false } },
});

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set. See .env.example.");
  process.exit(1);
}
if (args.id && !/^[a-f0-9]{24}$/.test(args.id)) {
  console.error("--id must be a version id (24 hex characters, the last part of a change's address).");
  process.exit(1);
}

const { client, db } = await connectWriter();
const c = collections(db);
let failed = 0;
try {
  let ids: ObjectId[];
  if (args.id) {
    ids = [new ObjectId(args.id)];
  } else {
    const done = new Set((await c.summaries.find({}, { projection: { _id: 1 } }).toArray()).map((s) => s._id.toHexString()));
    const changes = await c.versions.find({ previousId: { $ne: null } }, { projection: { _id: 1 }, sort: { capturedAt: -1 } }).toArray();
    ids = changes.map((v) => v._id).filter((id) => !done.has(id.toHexString()));
  }
  if (ids.length === 0) console.log("Every change already has a summary.");

  for (const id of ids) {
    try {
      const result = await summarizeVersion(c, id, { force: args.force });
      console.log(`${id}: ${result === "kept" ? "kept (reviewed by an admin; use --force to replace)" : result}`);
    } catch (error) {
      failed++;
      console.error(`${id}: failed (${(error as Error).message})`);
    }
  }
} finally {
  await client.close();
}
process.exit(failed ? 1 : 0);
