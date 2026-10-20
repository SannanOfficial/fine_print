/**
 * Shapes of the records stored in MongoDB, shared by the crawler, the admin
 * scripts and the website.
 *
 * The crawler writes the public record. The website's database role (see
 * fineprintSite in README.md) may also add versions, so that admins can
 * record one by hand, but it can never change or delete a stored version.
 */
import type { Binary, ObjectId } from "mongodb";
import type { Platform } from "./platforms.ts";

export const COLLECTIONS = {
  /** The platforms and documents we track, edited at /admin/platforms. */
  platforms: "platforms",
  /** One record per distinct text of a document, in the order it was seen. Append-only. */
  versions: "versions",
  /** One record per tracked document: the outcome of its latest check. */
  status: "status",
  /** Log of every check. Expires automatically (see setup-db). */
  checks: "checks",
  /** Prevents two crawler runs from overlapping. */
  locks: "locks",

  // Also written by the website:
  /** Plain-language summary of a change, keyed by the version's id. */
  summaries: "summaries",
  /** Agreements clinicians sent us privately. Personal details are encrypted. */
  submissions: "submissions",
  /** Files attached to submissions, encrypted. */
  submissionFiles: "submission_files",
  /** Signed-in admin sessions. Expire automatically. */
  sessions: "sessions",
  /** Counters for login and submission rate limits. Expire automatically. */
  rateLimits: "rate_limits",
  /** Newsletter subscribers. Addresses are encrypted. */
  subscribers: "subscribers",
  /** Dated, sourced events in a company's record (a rollout, a reversal, a new fee). Added by editors. */
  events: "events",

  // Managed only with `npm run admin`:
  admins: "admins",
} as const;

/**
 * "auto": read from the public page by the crawler (or an admin's "Fetch now").
 * "manual": saved from a browser or typed in by an admin.
 * "submission": sent privately by a clinician and confirmed by an editor.
 * "archive": an earlier version recovered from the Internet Archive's copy of
 *   the public page. `capturedAt` is when the archive first saw that text and
 *   `sourceUrl` the archived copy, so anyone can check it.
 */
export type CaptureMethod = "auto" | "manual" | "submission" | "archive";

/** A tracked platform as stored. The slug is the _id, so it is unique and fixed. */
export interface PlatformRecord extends Omit<Platform, "slug"> {
  _id: string;
  /** Position in lists; lower first. */
  order: number;
  createdAt: Date;
  updatedAt: Date;
  /** Email of the admin who last edited it; null for the starting list. */
  updatedBy: string | null;
}

export interface ChangeStats {
  added: number;
  removed: number;
  changed: number;
}

export interface VersionRecord {
  _id: ObjectId;
  platform: string;
  document: string;
  /** Normalised Markdown text of the document. */
  content: string;
  /** SHA-256 of `content`. */
  hash: string;
  /** When this text was first seen. */
  capturedAt: Date;
  /** Latest check that found this exact text still published. */
  lastSeenAt: Date;
  /** Where the text was published. Null when it was never public (for example, sent by email). */
  sourceUrl: string | null;
  method: CaptureMethod;
  /** Admin who recorded it by hand, if any. Never shown publicly. */
  recordedBy?: string;
  /**
   * The date printed on the document or on the email that carried it
   * (YYYY-MM-DD), as entered by an editor. `capturedAt` is when we recorded
   * it, or for "archive" versions when the Internet Archive first saw it.
   */
  datedOn?: string | null;
  previousId: ObjectId | null;
  /** Paragraph-level change counts against the previous version. */
  stats: ChangeStats | null;
}

export type CheckOutcome =
  | "first-capture"
  | "changed"
  | "unchanged"
  | "unstable"
  | "blocked"
  | "robots-disallowed"
  | "extraction-failed"
  | "fetch-failed";

export interface StatusRecord {
  _id: string; // "<platform>/<document>"
  platform: string;
  document: string;
  lastCheckedAt: Date;
  lastOutcome: CheckOutcome;
  /** Internal detail for maintainers. Never shown on the public site. */
  lastError: string | null;
  lastSuccessAt: Date | null;
  consecutiveFailures: number;
}

export interface CheckRecord {
  platform: string;
  document: string;
  at: Date;
  outcome: CheckOutcome;
  detail: string | null;
  durationMs: number;
}

export interface LockRecord {
  _id: string;
  holder: string;
  lockedUntil: Date;
}

/* ---------- Change summaries ---------- */

/**
 * "automatic": written by the AI model, not yet checked by an editor.
 * "reviewed": checked (and possibly edited) by an admin.
 * "hidden": withdrawn by an admin; not shown publicly.
 */
export type SummaryState = "automatic" | "reviewed" | "hidden";

export interface ChangeSummaryRecord {
  /** Same as the id of the version it describes. */
  _id: ObjectId;
  platform: string;
  document: string;
  /** One sentence. */
  headline: string;
  /** A few short points, in document order. */
  points: string[];
  state: SummaryState;
  /** AI model that wrote the first draft, if any. */
  model: string | null;
  generatedAt: Date | null;
  updatedAt: Date;
  /** Email of the admin who last edited it; null if never edited. */
  updatedBy: string | null;
}

/* ---------- Private submissions ---------- */

export type SubmissionStatus = "new" | "contacted" | "confirmed" | "rejected" | "published";

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  new: "New",
  contacted: "Contacted the sender",
  confirmed: "Confirmed",
  rejected: "Could not confirm",
  published: "Added to the record",
};

export const SHOWN_VIA = {
  email: "By email",
  "in-app": "Inside the platform's app or website",
  "sign-in": "As a prompt when signing in",
  contract: "As a contract or PDF to sign",
  other: "Some other way",
} as const;
export type ShownVia = keyof typeof SHOWN_VIA;

/** Everything private about a submission. Stored only in encrypted form. */
export interface SubmissionDetails {
  documentName: string;
  receivedOn: string | null; // YYYY-MM-DD
  shownVia: ShownVia;
  text: string;
  files: { id: string; name: string; type: string; size: number }[];
  contact: {
    name: string;
    email: string;
    phone: string;
    profession: string;
    prefers: "email" | "phone";
  };
}

export interface SubmissionRecord {
  _id: ObjectId;
  /** Shown to the person who sent it, e.g. "FP-7KQ3-9XZ2". */
  reference: string;
  receivedAt: Date;
  /** A tracked platform's slug, or "other". Not personal, kept in the clear for sorting. */
  platform: string;
  platformOther: string | null;
  status: SubmissionStatus;
  updatedAt: Date;
  updatedBy: string | null;
  /** SubmissionDetails, encrypted (see src/lib/seal.ts). */
  sealed: Binary;
  /** Admin notes, encrypted. */
  notes: Binary | null;
  /** The version recorded from it, once an editor adds it to the record. */
  recordedAs?: { platform: string; document: string; id: ObjectId };
}

export interface SubmissionFileRecord {
  _id: ObjectId;
  submissionId: ObjectId;
  type: string;
  size: number;
  /** File contents, encrypted. */
  sealed: Binary;
}

/* ---------- Admins ---------- */

export interface AdminRecord {
  _id: ObjectId;
  email: string;
  name: string;
  /** scrypt hash, see src/core/password.ts. */
  passwordHash: string;
  createdAt: Date;
  disabledAt: Date | null;
}

export interface SessionRecord {
  /** SHA-256 of the session token. The token itself is only in the cookie. */
  _id: string;
  adminId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

export interface RateLimitRecord {
  _id: string;
  count: number;
  expiresAt: Date;
}

/* ---------- Newsletter ---------- */

export interface SubscriberRecord {
  _id: ObjectId;
  /** Keyed hash of the lowercased address, for finding a subscriber without decrypting. */
  emailHash: string;
  /** The address, encrypted (context "subscriber:<id>"). */
  email: Binary;
  /** Platforms whose changes this person has confirmed they want. */
  platforms: string[];
  createdAt: Date;
  updatedAt: Date;
  /** Set until the first confirmation; the record is deleted automatically after it. */
  expiresAt: Date | null;
  /** Every change recorded up to this moment has been covered by a weekly email. */
  digestCursor: Date | null;
  lastSentAt: Date | null;
  /** Part of every link sent to this address. Unsubscribing deletes the record, which voids them all. */
  tokenVersion: number;
  /** Weekly sends in a row that the receiving server refused outright; the address is dropped after a few. */
  bounces?: number;
  /** When the last refusal was counted, so re-running the job in one week counts once. */
  lastBounceAt?: Date;
}

/**
 * Something that happened in a company's record that isn't a document's
 * text: a contract sent privately, a rollout paused, a new fee. Shown on the
 * company's timeline between its document changes. Every event cites where
 * it was reported.
 */
export interface EventRecord {
  _id: ObjectId;
  platform: string;
  /** YYYY-MM-DD. With precision "month", only the year and month are meaningful. */
  date: string;
  precision: "day" | "month";
  title: string;
  /** Plain text; paragraphs separated by a blank line. */
  body: string;
  sources: { label: string; url: string }[];
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string;
}
