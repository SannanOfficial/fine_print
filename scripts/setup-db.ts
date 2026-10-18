/**
 * Create the indexes Fine Print needs and add the starting platform list.
 * Safe to run more than once: platforms that already exist are left exactly
 * as admins have edited them.
 *
 *   npm run db:setup
 *
 * Uses MONGODB_WRITE_URI. To create the database users, see README.md.
 */
import { SEED_PLATFORMS } from "../src/core/platforms.ts";
import { COLLECTIONS, type PlatformRecord } from "../src/core/records.ts";
import { connectWriter } from "../src/crawler/db.ts";

const CHECK_LOG_DAYS = 180;

const { client, db } = await connectWriter();
try {
  await db.collection(COLLECTIONS.versions).createIndexes([
    { key: { platform: 1, document: 1, capturedAt: -1, _id: -1 }, name: "by_document_newest" },
    { key: { capturedAt: -1 }, name: "newest_first" },
    // Each version has at most one successor, so two saves at the same moment can't fork the history.
    { key: { platform: 1, document: 1, previousId: 1 }, name: "one_successor", unique: true },
  ]);
  await db.collection(COLLECTIONS.checks).createIndexes([
    { key: { platform: 1, document: 1, at: -1 }, name: "by_document_newest" },
    { key: { at: 1 }, name: "expire_old_checks", expireAfterSeconds: CHECK_LOG_DAYS * 24 * 60 * 60 },
  ]);
  await db.collection(COLLECTIONS.summaries).createIndexes([{ key: { state: 1 }, name: "by_state" }]);
  await db.collection(COLLECTIONS.submissions).createIndexes([
    { key: { reference: 1 }, name: "unique_reference", unique: true },
    { key: { receivedAt: -1 }, name: "newest_first" },
    { key: { status: 1, receivedAt: -1 }, name: "by_status" },
  ]);
  await db.collection(COLLECTIONS.submissionFiles).createIndexes([{ key: { submissionId: 1 }, name: "by_submission" }]);
  await db.collection(COLLECTIONS.admins).createIndexes([{ key: { email: 1 }, name: "unique_email", unique: true }]);
  await db.collection(COLLECTIONS.sessions).createIndexes([
    { key: { adminId: 1 }, name: "by_admin" },
    { key: { expiresAt: 1 }, name: "expire_sessions", expireAfterSeconds: 0 },
  ]);
  await db.collection(COLLECTIONS.subscribers).createIndexes([
    { key: { emailHash: 1 }, name: "unique_email", unique: true },
    { key: { platforms: 1 }, name: "by_platform" },
    // Sign-ups nobody confirmed are deleted after a week.
    { key: { expiresAt: 1 }, name: "expire_unconfirmed", expireAfterSeconds: 0 },
  ]);
  await db.collection(COLLECTIONS.rateLimits).createIndexes([
    { key: { expiresAt: 1 }, name: "expire_counters", expireAfterSeconds: 0 },
  ]);
  console.log(`Indexes ready in database "${db.databaseName}".`);

  const platforms = db.collection<PlatformRecord>(COLLECTIONS.platforms);
  const now = new Date();
  let added = 0;
  for (const [i, { slug, ...rest }] of SEED_PLATFORMS.entries()) {
    const result = await platforms.updateOne(
      { _id: slug },
      { $setOnInsert: { ...rest, order: (i + 1) * 10, createdAt: now, updatedAt: now, updatedBy: null } },
      { upsert: true },
    );
    added += result.upsertedCount;
  }
  console.log(added ? `Added ${added} platforms from the starting list.` : "Platform list already in place.");
} finally {
  await client.close();
}
