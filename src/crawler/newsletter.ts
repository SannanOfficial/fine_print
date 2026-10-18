import type { ObjectId } from "mongodb";
import { digestEmail, type DigestGroup } from "../core/newsletter-email.ts";
import { manageToken } from "../core/newsletter-links.ts";
import { sendMail } from "../core/mailer.ts";
import type { Platform } from "../core/platforms.ts";
import type { ChangeStats, ChangeSummaryRecord } from "../core/records.ts";
import { unseal } from "../core/seal.ts";
import { loadPlatforms, type Collections } from "./db.ts";

/*
 * The weekly email. Each subscriber gets the changes recorded since their
 * last email (their digestCursor), on the platforms they follow. Nobody is
 * emailed in a week with no changes on their platforms. A subscriber's
 * cursor only moves on after their email is sent, so a failed send is
 * retried next time and a re-run never sends anything twice.
 */

const WEEK_MS = 7 * 86_400_000;
/**
 * Changes saved in the last couple of minutes wait for next week. A version
 * is dated just before it is written, so this keeps one being written right
 * now from landing behind a cursor that has already moved past it.
 */
const SETTLE_MS = 2 * 60_000;
/** The receiving server refused the address outright this many weeks in a row: it is deleted. */
const MAX_BOUNCES = 3;
/** Refusals closer together than this count once, so re-running the job doesn't add up "weeks". */
const BOUNCE_GAP_MS = 6 * 86_400_000;

type MailError = { code?: string; command?: string; responseCode?: number };

/** The recipient's server refused this address itself (a permanent "no such user" and the like). */
export function recipientRefused(error: unknown): boolean {
  const e = error as MailError;
  return e.code === "EENVELOPE" && e.command === "RCPT TO" && (e.responseCode ?? 0) >= 500;
}

/**
 * A problem on our side: the SMTP login, the connection, or the sender
 * address. Every send would fail the same way, so the run stops and no
 * subscriber is blamed for it.
 */
export function ourProblem(error: unknown): boolean {
  const e = error as MailError;
  return (
    ["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ETLS", "EPROTOCOL"].includes(e.code ?? "") ||
    (e.code === "EENVELOPE" && e.command === "MAIL FROM")
  );
}

const noWordingChanged = (s: ChangeStats | null) => s !== null && s.added + s.removed + s.changed === 0;

export interface ChangeRow {
  _id: ObjectId;
  platform: string;
  document: string;
  capturedAt: Date;
  stats: ChangeStats | null;
  datedOn?: string | null;
}

type Summary = Pick<ChangeSummaryRecord, "headline" | "points" | "state" | "model">;

/** One subscriber's changes, grouped by platform in list order. Documents no longer tracked are left out. */
export function groupChanges(
  follows: string[],
  changes: ChangeRow[],
  platforms: Platform[],
  summaries: Map<string, Summary>,
  since: Date,
): DigestGroup[] {
  const groups: DigestGroup[] = [];
  for (const p of platforms) {
    if (!follows.includes(p.slug)) continue;
    const mine = changes
      .filter((c) => c.platform === p.slug && c.capturedAt > since)
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    const items = mine.flatMap((c) => {
      const doc = p.documents.find((d) => d.slug === c.document);
      // Only links or formatting changed: nothing worth an email.
      if (!doc || noWordingChanged(c.stats)) return [];
      const s = summaries.get(c._id.toHexString());
      return [
        {
          documentTitle: doc.title,
          documentSlug: doc.slug,
          versionId: c._id.toHexString(),
          capturedAt: c.capturedAt,
          datedOn: c.datedOn ?? null,
          stats: c.stats,
          summary: s && s.state !== "hidden" ? { headline: s.headline, points: s.points, reviewed: s.state === "reviewed", byAi: s.model !== null } : null,
        },
      ];
    });
    if (items.length) groups.push({ platformName: p.name, platformSlug: p.slug, changes: items });
  }
  return groups;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}${"*".repeat(Math.max(1, Math.min(user.length - 1, 6)))}@${domain}`;
}

export interface DigestResult {
  sent: number;
  nothingNew: number;
  failed: number;
  /** Set when the run stopped early because of a problem on our side. */
  stopped?: string;
}

export async function runDigest(
  c: Collections,
  { now = new Date(), dryRun = false, siteUrl, log = console.log }: { now?: Date; dryRun?: boolean; siteUrl: string; log?: (line: string) => void },
): Promise<DigestResult> {
  const result: DigestResult = { sent: 0, nothingNew: 0, failed: 0 };
  const subscribers = await c.subscribers.find({ expiresAt: null, platforms: { $ne: [] } }).toArray();
  if (subscribers.length === 0) {
    log("No confirmed subscribers.");
    return result;
  }

  const until = new Date(now.getTime() - SETTLE_MS);
  const defaultSince = new Date(until.getTime() - WEEK_MS);
  const sinceFor = (s: (typeof subscribers)[number]) => s.digestCursor ?? defaultSince;
  const earliest = new Date(Math.min(...subscribers.map((s) => sinceFor(s).getTime())));

  const [platforms, changes] = await Promise.all([
    loadPlatforms(c),
    c.versions
      .find(
        { previousId: { $ne: null }, capturedAt: { $gt: earliest, $lte: until } },
        { projection: { platform: 1, document: 1, capturedAt: 1, stats: 1, datedOn: 1 } },
      )
      .toArray() as Promise<ChangeRow[]>,
  ]);
  const summaryRows = changes.length
    ? await c.summaries
        .find({ _id: { $in: changes.map((v) => v._id) } }, { projection: { headline: 1, points: 1, state: 1, model: 1 } })
        .toArray()
    : [];
  const summaries = new Map(summaryRows.map((s) => [s._id.toHexString(), s as Summary]));
  log(`${changes.length} changes recorded since ${earliest.toISOString()}; ${subscribers.length} subscribers.`);

  for (const s of subscribers) {
    const since = sinceFor(s);
    const groups = groupChanges(s.platforms, changes, platforms, summaries, since);
    const id = s._id.toHexString();

    if (groups.length === 0) {
      result.nothingNew++;
      if (!dryRun) await c.subscribers.updateOne({ _id: s._id }, { $max: { digestCursor: until } });
      continue;
    }

    let email = `subscriber ${id}`;
    try {
      email = unseal(s.email, `subscriber:${id}`).toString("utf8");
      const token = manageToken(id, s.tokenVersion);
      const composed = digestEmail({
        groups,
        periodStart: since,
        periodEnd: until,
        siteUrl,
        manageUrl: `${siteUrl}/newsletter/manage?t=${token}`,
      });
      const count = groups.reduce((n, g) => n + g.changes.length, 0);

      if (dryRun) {
        log(`would send to ${maskEmail(email)}: "${composed.subject}" (${count} changes)`);
        result.sent++;
        continue;
      }
      await sendMail({
        to: email,
        ...composed,
        headers: {
          "List-Unsubscribe": `<${siteUrl}/newsletter/unsubscribe?t=${token}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await c.subscribers.updateOne(
        { _id: s._id },
        { $max: { digestCursor: until }, $set: { lastSentAt: new Date(), bounces: 0 }, $unset: { lastBounceAt: "" } },
      );
      result.sent++;
      log(`sent to ${maskEmail(email)}: ${count} changes`);
    } catch (error) {
      result.failed++;
      if (ourProblem(error)) {
        result.stopped = (error as Error).message;
        log(`stopped: ${(error as Error).message}. This is a problem with the mail settings, not the subscribers; nobody was marked as bouncing. Fix it and run again.`);
        break;
      }
      const who = email.includes("@") ? maskEmail(email) : email;
      const recent = s.lastBounceAt && now.getTime() - s.lastBounceAt.getTime() < BOUNCE_GAP_MS;
      if (!dryRun && recipientRefused(error) && !recent) {
        const bounces = (s.bounces ?? 0) + 1;
        if (bounces >= MAX_BOUNCES) {
          await c.subscribers.deleteOne({ _id: s._id });
          log(`refused for ${who} ${bounces} weeks running (${(error as MailError).responseCode}); address deleted`);
          continue;
        }
        await c.subscribers.updateOne({ _id: s._id }, { $set: { bounces, lastBounceAt: now } });
      }
      log(`failed for ${who}: ${(error as Error).message} (will retry next run)`);
    }
  }
  return result;
}
