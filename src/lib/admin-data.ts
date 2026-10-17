import "server-only";
import { ObjectId } from "mongodb";
import { findDocument, findPlatform, type Platform } from "@/core/platforms.ts";
import {
  COLLECTIONS,
  type CaptureMethod,
  type ChangeSummaryRecord,
  type PlatformRecord,
  type StatusRecord,
  type SubmissionDetails,
  type SubmissionFileRecord,
  type SubmissionRecord,
  type SubmissionStatus,
  type VersionRecord,
} from "@/core/records.ts";

export { STATUS_LABELS } from "@/core/records.ts";
import { requireAdmin } from "./auth.ts";
import { getDb } from "./db.ts";
import { toPlatform } from "./registry.ts";
import { unseal, unsealJson } from "./seal.ts";

/*
 * Queries for the admin pages. Every exported function checks the session
 * itself, so no caller can forget to. Nothing here is cached: admins always
 * see the current state, and private data never enters a shared cache.
 */

const isId = (id: string) => /^[a-f0-9]{24}$/.test(id);

async function cols() {
  const db = await getDb();
  return {
    submissions: db.collection<SubmissionRecord>(COLLECTIONS.submissions),
    files: db.collection<SubmissionFileRecord>(COLLECTIONS.submissionFiles),
    summaries: db.collection<ChangeSummaryRecord>(COLLECTIONS.summaries),
    versions: db.collection<VersionRecord>(COLLECTIONS.versions),
    platforms: db.collection<PlatformRecord>(COLLECTIONS.platforms),
    status: db.collection<StatusRecord>(COLLECTIONS.status),
  };
}

/** The platform list straight from the database (admins never see a cached copy). */
export async function listPlatforms(): Promise<Platform[]> {
  await requireAdmin();
  const rows = await (await cols()).platforms.find({}, { sort: { order: 1, _id: 1 } }).toArray();
  return rows.map(toPlatform);
}

export function platformLabel(list: Platform[], slug: string, other: string | null): string {
  return slug === "other" ? (other ?? "Another platform") : (findPlatform(list, slug)?.name ?? slug);
}

const detailsOf = (s: SubmissionRecord) => unsealJson<SubmissionDetails>(s.sealed, `submission:${s._id.toHexString()}`);

export interface SubmissionRow {
  id: string;
  reference: string;
  receivedAt: Date;
  platform: string;
  documentName: string;
  senderName: string;
  status: SubmissionStatus;
}

export async function listSubmissions(): Promise<SubmissionRow[]> {
  const platforms = await listPlatforms();
  const rows = await (await cols()).submissions.find({}, { sort: { receivedAt: -1 }, limit: 300 }).toArray();
  return rows.map((s) => {
    const d = detailsOf(s);
    return {
      id: s._id.toHexString(),
      reference: s.reference,
      receivedAt: s.receivedAt,
      platform: platformLabel(platforms, s.platform, s.platformOther),
      documentName: d.documentName,
      senderName: d.contact.name,
      status: s.status,
    };
  });
}

export async function getSubmission(id: string) {
  const platforms = await listPlatforms();
  if (!isId(id)) return null;
  const s = await (await cols()).submissions.findOne({ _id: new ObjectId(id) });
  if (!s) return null;
  return {
    id,
    reference: s.reference,
    receivedAt: s.receivedAt,
    platformSlug: s.platform,
    platform: platformLabel(platforms, s.platform, s.platformOther),
    status: s.status,
    updatedAt: s.updatedAt,
    updatedBy: s.updatedBy,
    details: detailsOf(s),
    notes: s.notes ? unseal(s.notes, `notes:${id}`).toString("utf8") : "",
  };
}

/** One attached file, decrypted, with the name the sender gave it. */
export async function getSubmissionFile(submissionId: string, fileId: string) {
  await requireAdmin();
  if (!isId(submissionId) || !isId(fileId)) return null;
  const c = await cols();
  const s = await c.submissions.findOne({ _id: new ObjectId(submissionId) });
  const meta = s && detailsOf(s).files.find((f) => f.id === fileId);
  if (!meta) return null;
  const file = await c.files.findOne({ _id: new ObjectId(fileId), submissionId: new ObjectId(submissionId) });
  if (!file) return null;
  return { name: meta.name, type: file.type, bytes: unseal(file.sealed, `file:${fileId}`) };
}

export interface ChangeRow {
  id: string;
  platform: string;
  document: string;
  title: string;
  capturedAt: Date;
  summaryState: ChangeSummaryRecord["state"] | "missing";
  headline: string | null;
}

export async function listChanges(): Promise<ChangeRow[]> {
  const platforms = await listPlatforms();
  const c = await cols();
  const versions = await c.versions
    .find(
      { previousId: { $ne: null } },
      { projection: { platform: 1, document: 1, capturedAt: 1 }, sort: { capturedAt: -1 }, limit: 200 },
    )
    .toArray();
  const summaries = await c.summaries
    .find({ _id: { $in: versions.map((v) => v._id) } }, { projection: { state: 1, headline: 1 } })
    .toArray();
  const byId = new Map(summaries.map((s) => [s._id.toHexString(), s]));
  return versions.map((v) => {
    const s = byId.get(v._id.toHexString());
    const found = findDocument(platforms, v.platform, v.document);
    return {
      id: v._id.toHexString(),
      platform: v.platform,
      document: v.document,
      title: found ? `${found.platform.name}: ${found.document.title}` : `${v.platform}/${v.document}`,
      capturedAt: v.capturedAt,
      summaryState: s?.state ?? "missing",
      headline: s?.headline ?? null,
    };
  });
}

export async function getChange(id: string) {
  const platforms = await listPlatforms();
  if (!isId(id)) return null;
  const c = await cols();
  const version = await c.versions.findOne({ _id: new ObjectId(id), previousId: { $ne: null } });
  if (!version?.previousId) return null;
  const [previous, summary] = await Promise.all([
    c.versions.findOne({ _id: version.previousId }),
    c.summaries.findOne({ _id: version._id }),
  ]);
  if (!previous) return null;
  const found = findDocument(platforms, version.platform, version.document);
  const title = found ? `${found.platform.name}: ${found.document.title}` : `${version.platform}/${version.document}`;
  return { version, previous, summary, title };
}

/* ---------- The platform list ---------- */

export interface AdminDocumentRow {
  slug: string;
  title: string;
  mode: "auto" | "manual";
  versions: number;
  lastCapturedAt: Date | null;
  status: Pick<StatusRecord, "lastCheckedAt" | "lastOutcome" | "lastError" | "consecutiveFailures"> | null;
}

/** Version counts and latest check for every document, keyed "platform/document". */
async function documentFacts() {
  const c = await cols();
  const [counts, statuses] = await Promise.all([
    c.versions
      .aggregate<{ _id: { p: string; d: string }; n: number; last: Date }>([
        { $group: { _id: { p: "$platform", d: "$document" }, n: { $sum: 1 }, last: { $max: "$capturedAt" } } },
      ])
      .toArray(),
    c.status.find({}).toArray(),
  ]);
  return {
    counts: new Map(counts.map((r) => [`${r._id.p}/${r._id.d}`, r])),
    statuses: new Map(statuses.map((s) => [s._id, s])),
  };
}

export async function listPlatformsWithFacts() {
  const platforms = await listPlatforms();
  const { counts, statuses } = await documentFacts();
  return platforms.map((p) => ({
    ...p,
    rows: p.documents.map((d): AdminDocumentRow => {
      const key = `${p.slug}/${d.slug}`;
      const count = counts.get(key);
      const status = statuses.get(key);
      return {
        slug: d.slug,
        title: d.title,
        mode: d.mode,
        versions: count?.n ?? 0,
        lastCapturedAt: count?.last ?? null,
        status: status ?? null,
      };
    }),
  }));
}

export async function getPlatformForEdit(slug: string) {
  const all = await listPlatformsWithFacts();
  return all.find((p) => p.slug === slug) ?? null;
}

export interface AdminVersionRow {
  id: string;
  capturedAt: Date;
  method: CaptureMethod;
  recordedBy: string | null;
  isFirst: boolean;
  chars: number;
}

export async function getDocumentForEdit(platformSlug: string, documentSlug: string) {
  const platforms = await listPlatforms();
  const found = findDocument(platforms, platformSlug, documentSlug);
  if (!found) return null;
  const c = await cols();
  const [versions, status, latest] = await Promise.all([
    c.versions
      .find(
        { platform: platformSlug, document: documentSlug },
        {
          projection: { capturedAt: 1, method: 1, recordedBy: 1, previousId: 1, chars: { $strLenCP: "$content" } },
          sort: { capturedAt: -1, _id: -1 },
          limit: 50,
        },
      )
      .toArray(),
    c.status.findOne({ _id: `${platformSlug}/${documentSlug}` }),
    c.versions.findOne({ platform: platformSlug, document: documentSlug }, { sort: { capturedAt: -1, _id: -1 } }),
  ]);
  return {
    ...found,
    platforms,
    status,
    latestContent: latest?.content ?? null,
    versions: versions.map(
      (v): AdminVersionRow => ({
        id: v._id.toHexString(),
        capturedAt: v.capturedAt,
        method: v.method,
        recordedBy: v.recordedBy ?? null,
        isFirst: v.previousId === null,
        chars: (v as unknown as { chars: number }).chars,
      }),
    ),
  };
}

/** A submission's pasted text and reference, to start a version from it. */
export async function getSubmissionForRecord(id: string) {
  await requireAdmin();
  if (!isId(id)) return null;
  const s = await (await cols()).submissions.findOne({ _id: new ObjectId(id) });
  if (!s) return null;
  const d = detailsOf(s);
  return { id, reference: s.reference, text: d.text, documentName: d.documentName, status: s.status };
}
