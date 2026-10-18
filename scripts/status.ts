/**
 * How the record is doing, in one screen: every tracked document with its
 * version count, last change, last check and any error; then the jobs'
 * locks, subscribers and summaries still to write.
 *
 *   npm run status
 *
 * Exits 2 when any document has failed three checks in a row, so a cron
 * job or health-check service can raise the alarm.
 */
import { collections, connectWriter, loadPlatforms } from "../src/crawler/db.ts";

const { client, db } = await connectWriter();
const c = collections(db);

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "—");
const cut = (s: string | null | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : (s ?? ""));

try {
  const [platforms, statusRows, facts, locks, confirmed, pending] = await Promise.all([
    loadPlatforms(c),
    c.status.find({}).toArray(),
    c.versions
      .aggregate<{ _id: { p: string; d: string }; n: number; last: Date; changes: number }>([
        { $sort: { platform: 1, document: 1, capturedAt: -1, _id: -1 } },
        {
          $group: {
            _id: { p: "$platform", d: "$document" },
            n: { $sum: 1 },
            last: { $first: "$capturedAt" },
            changes: { $sum: { $cond: [{ $ne: ["$previousId", null] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
    c.locks.find({ lockedUntil: { $gt: new Date() } }).toArray(),
    c.subscribers.countDocuments({ expiresAt: null }),
    c.subscribers.countDocuments({ expiresAt: { $ne: null } }),
  ]);
  const status = new Map(statusRows.map((s) => [s._id, s]));
  const fact = new Map(facts.map((f) => [`${f._id.p}/${f._id.d}`, f]));

  const rows = platforms.flatMap((p) =>
    p.documents.map((d) => {
      const key = `${p.slug}/${d.slug}`;
      const f = fact.get(key);
      const s = status.get(key);
      return {
        document: key,
        mode: d.mode,
        versions: f?.n ?? 0,
        "last version": day(f?.last),
        "last check": day(s?.lastCheckedAt),
        outcome: s?.lastOutcome ?? "never",
        fails: s?.consecutiveFailures ?? 0,
        error: cut(s?.lastError, 60),
      };
    }),
  );
  console.table(rows);

  const changeIds = await c.versions.distinct("_id", { previousId: { $ne: null } });
  const summarised = await c.summaries.countDocuments({ _id: { $in: changeIds } });
  const unreviewed = await c.summaries.countDocuments({ state: "automatic" });
  const week = new Date(Date.now() - 7 * 86_400_000);
  const recent = await c.checks
    .aggregate<{ _id: string; n: number }>([{ $match: { at: { $gt: week } } }, { $group: { _id: "$outcome", n: { $sum: 1 } } }])
    .toArray();

  console.log(`Summaries: ${changeIds.length - summarised} missing, ${unreviewed} awaiting an editor's review.`);
  console.log(`Subscribers: ${confirmed} confirmed, ${pending} waiting to confirm.`);
  console.log(`Checks in the last 7 days: ${recent.map((r) => `${r.n} ${r._id}`).join(", ") || "none"}.`);
  console.log(
    locks.length
      ? `Locks held: ${locks.map((l) => `${l._id} by ${l.holder} until ${day(l.lockedUntil)}`).join("; ")}.`
      : "No job is running.",
  );

  // Documents captured by hand aren't the crawler's job, so its failures there aren't an alarm.
  const struggling = rows.filter((r) => r.mode === "auto" && r.fails >= 3);
  if (struggling.length) {
    console.log(`\nNeeds attention: ${struggling.map((r) => r.document).join(", ")} (3 or more failed checks in a row).`);
    process.exitCode = 2;
  }
} finally {
  await client.close();
}
