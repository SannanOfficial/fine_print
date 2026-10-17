"use server";

import { ObjectId } from "mongodb";
import { revalidateTag, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { diffDocuments, summarize, type DiffEntry } from "@/core/diff.ts";
import {
  documentProblems,
  findDocument,
  isHttpsUrl,
  MANUAL_REASONS,
  platformProblems,
  type Audience,
  type TrackedDocument,
} from "@/core/platforms.ts";
import {
  COLLECTIONS,
  type ChangeStats,
  type ChangeSummaryRecord,
  type CheckRecord,
  type PlatformRecord,
  type StatusRecord,
  type SubmissionRecord,
  type VersionRecord,
} from "@/core/records.ts";
import { sha256 } from "@/core/hash.ts";
import { normalizeMarkdown } from "@/core/text.ts";
import { fetchDocument } from "@/crawler/check.ts";
import { ExtractionError, extractDocument } from "@/crawler/extract.ts";
import { ConcurrentVersionError, latestVersion, recordCheck, saveVersion } from "@/crawler/record.ts";
import { RobotsCache } from "@/crawler/robots.ts";
import { summarizeVersion } from "@/crawler/summary.ts";
import { requireAdmin } from "@/lib/auth.ts";
import { getDb } from "@/lib/db.ts";
import { forgetKnownPaths } from "@/lib/known-paths.ts";
import { toPlatform } from "@/lib/registry.ts";

/*
 * Editing the platform list and recording versions by hand. Every action is
 * a public POST endpoint, so each checks the session itself and validates
 * everything it receives.
 */

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};
const lines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

async function collections() {
  const db = await getDb();
  return {
    platforms: db.collection<PlatformRecord>(COLLECTIONS.platforms),
    versions: db.collection<VersionRecord>(COLLECTIONS.versions),
    summaries: db.collection<ChangeSummaryRecord>(COLLECTIONS.summaries),
    status: db.collection<StatusRecord>(COLLECTIONS.status),
    checks: db.collection<CheckRecord>(COLLECTIONS.checks),
    submissions: db.collection<SubmissionRecord>(COLLECTIONS.submissions),
  };
}

/** The public site and the proxy's list of addresses both change. */
function registryChanged() {
  updateTag("registry");
  forgetKnownPaths();
}

/* ---------- Platforms ---------- */

export type PlatformValues = { slug: string; name: string; kind: string; website: string };
export type PlatformState = { ok: boolean; message: string; values: PlatformValues; key: number } | null;

function platformValues(form: FormData, slug?: string): PlatformValues {
  return {
    slug: slug ?? field(form, "slug").toLowerCase(),
    name: field(form, "name"),
    kind: field(form, "kind"),
    website: field(form, "website"),
  };
}

export async function addPlatform(_previous: PlatformState, form: FormData): Promise<PlatformState> {
  const admin = await requireAdmin();
  const values = platformValues(form);
  const fail = (message: string): PlatformState => ({ ok: false, message, values, key: Date.now() });
  const problems = platformProblems(values);
  if (problems.length) return fail(problems.join(" "));

  const c = await collections();
  const last = await c.platforms.findOne({}, { sort: { order: -1 }, projection: { order: 1 } });
  const now = new Date();
  try {
    await c.platforms.insertOne({
      _id: values.slug,
      name: values.name,
      kind: values.kind,
      website: values.website,
      documents: [],
      order: (last?.order ?? 0) + 10,
      createdAt: now,
      updatedAt: now,
      updatedBy: admin.email,
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return fail(`A platform with the short name “${values.slug}” already exists.`);
    throw error;
  }
  registryChanged();
  redirect(`/admin/platforms/${values.slug}?added=platform`);
}

export async function updatePlatform(slug: string, _previous: PlatformState, form: FormData): Promise<PlatformState> {
  const admin = await requireAdmin();
  const values = platformValues(form, slug);
  const problems = platformProblems(values);
  if (problems.length) return { ok: false, message: problems.join(" "), values, key: Date.now() };

  const result = await (await collections()).platforms.updateOne(
    { _id: slug },
    { $set: { name: values.name, kind: values.kind, website: values.website, updatedAt: new Date(), updatedBy: admin.email } },
  );
  if (result.matchedCount === 0) return { ok: false, message: "This platform no longer exists.", values, key: Date.now() };
  registryChanged();
  return { ok: true, message: "Saved. The public site shows the change now.", values, key: Date.now() };
}

export type SimpleState = { ok: boolean; message: string } | null;

export async function deletePlatform(slug: string, _previous: SimpleState, form: FormData): Promise<SimpleState> {
  await requireAdmin();
  if (field(form, "confirm") !== slug) return { ok: false, message: `Type “${slug}” to confirm.` };
  const c = await collections();
  if (await c.versions.findOne({ platform: slug }, { projection: { _id: 1 } })) {
    return { ok: false, message: "This platform has versions on the record, so it can't be deleted." };
  }
  await c.platforms.deleteOne({ _id: slug });
  registryChanged();
  redirect("/admin/platforms?deleted=1");
}

/* ---------- Documents ---------- */

export type DocumentValues = {
  slug: string;
  title: string;
  audience: string;
  url: string;
  mode: string;
  manualPreset: string;
  manualCustom: string;
  selectors: string;
  remove: string;
  redirectHosts: string;
  source: string;
};
export type DocumentState = { ok: boolean; message: string; values: DocumentValues; key: number } | null;

function documentValues(form: FormData, slug?: string): DocumentValues {
  return {
    slug: slug ?? field(form, "slug").toLowerCase(),
    title: field(form, "title"),
    audience: field(form, "audience"),
    url: field(form, "url"),
    mode: field(form, "mode"),
    manualPreset: field(form, "manualPreset"),
    manualCustom: field(form, "manualCustom"),
    selectors: field(form, "selectors"),
    remove: field(form, "remove"),
    redirectHosts: field(form, "redirectHosts"),
    source: field(form, "source"),
  };
}

function toDocument(v: DocumentValues): TrackedDocument {
  const audience: Audience = v.audience === "clients" || v.audience === "everyone" ? v.audience : "providers";
  const mode = v.mode === "manual" ? "manual" : "auto";
  const manualReason =
    v.manualPreset === "blocked" || v.manualPreset === "browser" ? MANUAL_REASONS[v.manualPreset] : v.manualCustom;
  const remove = lines(v.remove);
  const redirectHosts = lines(v.redirectHosts.replace(/[,\s]+/g, "\n")).map((h) => h.toLowerCase());
  return {
    slug: v.slug,
    title: v.title,
    audience,
    url: v.url || null,
    mode,
    ...(mode === "manual" ? { manualReason } : {}),
    selectors: lines(v.selectors),
    ...(remove.length ? { remove } : {}),
    ...(redirectHosts.length ? { redirectHosts } : {}),
    ...(v.source === "zendesk-api" ? { source: "zendesk-api" as const } : {}),
  };
}

export async function addDocument(platformSlug: string, _previous: DocumentState, form: FormData): Promise<DocumentState> {
  const admin = await requireAdmin();
  const values = documentValues(form);
  const fail = (message: string): DocumentState => ({ ok: false, message, values, key: Date.now() });
  const doc = toDocument(values);
  const problems = documentProblems(doc);
  if (problems.length) return fail(problems.join(" "));

  const result = await (await collections()).platforms.updateOne(
    { _id: platformSlug, "documents.slug": { $ne: doc.slug } },
    { $push: { documents: doc }, $set: { updatedAt: new Date(), updatedBy: admin.email } },
  );
  if (result.matchedCount === 0) return fail(`This platform already has a document called “${doc.slug}”.`);
  registryChanged();
  redirect(`/admin/platforms/${platformSlug}/${doc.slug}?added=document`);
}

export async function updateDocument(
  platformSlug: string,
  documentSlug: string,
  _previous: DocumentState,
  form: FormData,
): Promise<DocumentState> {
  const admin = await requireAdmin();
  const values = documentValues(form, documentSlug);
  const doc = toDocument(values);
  const problems = documentProblems(doc);
  if (problems.length) return { ok: false, message: problems.join(" "), values, key: Date.now() };

  const result = await (await collections()).platforms.updateOne(
    { _id: platformSlug, "documents.slug": documentSlug },
    { $set: { "documents.$": doc, updatedAt: new Date(), updatedBy: admin.email } },
  );
  if (result.matchedCount === 0) return { ok: false, message: "This document no longer exists.", values, key: Date.now() };
  registryChanged();
  return { ok: true, message: "Saved. The crawler uses these settings from its next run.", values, key: Date.now() };
}

export async function deleteDocument(
  platformSlug: string,
  documentSlug: string,
  _previous: SimpleState,
  form: FormData,
): Promise<SimpleState> {
  const admin = await requireAdmin();
  if (field(form, "confirm") !== documentSlug) return { ok: false, message: `Type “${documentSlug}” to confirm.` };
  const c = await collections();
  if (await c.versions.findOne({ platform: platformSlug, document: documentSlug }, { projection: { _id: 1 } })) {
    return { ok: false, message: "This document has versions on the record, so it can't be deleted." };
  }
  await c.platforms.updateOne(
    { _id: platformSlug },
    { $pull: { documents: { slug: documentSlug } }, $set: { updatedAt: new Date(), updatedBy: admin.email } },
  );
  registryChanged();
  redirect(`/admin/platforms/${platformSlug}?deleted=document`);
}

/* ---------- Recording a version ---------- */

export type RecordValues = { text: string; sourceUrl: string; fetchedHash: string; submissionId: string };
export type RecordState = {
  ok: boolean;
  message: string;
  values: RecordValues;
  key: number;
  preview?: { stats: ChangeStats | null; entries: DiffEntry[]; chars: number };
} | null;

/** Saved pages can be large; the text inside is what matters. */
const MAX_PAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 1_000_000;

export async function recordVersion(
  platformSlug: string,
  documentSlug: string,
  _previous: RecordState,
  form: FormData,
): Promise<RecordState> {
  const admin = await requireAdmin();
  const intent = field(form, "intent");
  const values: RecordValues = {
    text: (typeof form.get("text") === "string" ? (form.get("text") as string) : "").slice(0, MAX_TEXT_CHARS + 1),
    sourceUrl: field(form, "sourceUrl"),
    fetchedHash: field(form, "fetchedHash"),
    submissionId: /^[a-f0-9]{24}$/.test(field(form, "submissionId")) ? field(form, "submissionId") : "",
  };
  const reply = (ok: boolean, message: string, extra: Partial<NonNullable<RecordState>> = {}): RecordState => ({
    ok,
    message,
    values,
    key: Date.now(),
    ...extra,
  });

  const c = await collections();
  const row = await c.platforms.findOne({ _id: platformSlug });
  const found = row ? findDocument([toPlatform(row)], platformSlug, documentSlug) : undefined;
  if (!found) return reply(false, "This document no longer exists.");
  const doc = found.document;

  if (intent === "fetch") {
    if (!doc.url) return reply(false, "Add the document's address in its settings first.");
    const result = await fetchDocument(doc, new RobotsCache());
    if (!result.ok) return reply(false, `Could not read the page: ${result.detail}`);
    values.text = result.content;
    values.fetchedHash = sha256(result.content);
    values.sourceUrl = doc.url;
    return reply(true, `Read ${result.content.length.toLocaleString("en-US")} characters from the page. Check the text, then preview the changes.`);
  }

  if (intent === "extract") {
    const file = form.get("page");
    if (!(file instanceof File) || file.size === 0) return reply(false, "Choose a saved page (.html) first.");
    if (file.size > MAX_PAGE_BYTES) return reply(false, "That file is over 5 MB. Save the page as “Webpage, HTML only”.");
    let html: string;
    try {
      html = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      return reply(false, "That file isn't a saved web page (it isn't readable text).");
    }
    try {
      values.text = extractDocument(html, doc).content;
    } catch (error) {
      if (error instanceof ExtractionError) {
        return reply(false, `Could not find the document text: ${error.message}. Check the document's settings, or paste the text instead.`);
      }
      throw error;
    }
    values.fetchedHash = "";
    return reply(true, `Took ${values.text.length.toLocaleString("en-US")} characters from the saved page. Check the text, then preview the changes.`);
  }

  // "preview" and "record" both work from the text in the box.
  const content = normalizeMarkdown(values.text);
  if (!content) return reply(false, "Paste or fetch the text of the new version first.");
  if (content.length > MAX_TEXT_CHARS) return reply(false, "That text is over a million characters. Is it the right document?");
  if (values.sourceUrl && !isHttpsUrl(values.sourceUrl)) return reply(false, "The source address must start with https://, or be left empty.");

  const previous = await latestVersion(c, platformSlug, documentSlug);
  if (previous && previous.hash === sha256(content)) {
    return reply(false, "This text is identical to the latest version on the record, so there is nothing to add.");
  }

  if (intent === "preview") {
    const entries = previous ? diffDocuments(previous.content, content) : [];
    const shrank = previous && content.length < previous.content.length * 0.5;
    return reply(
      true,
      previous
        ? `This would be recorded as a change.${shrank ? " Careful: it is less than half the length of the current version. Make sure nothing is missing." : ""}`
        : "This would be the first copy of this document on the record.",
      { preview: { stats: previous ? summarize(entries) : null, entries, chars: content.length } },
    );
  }

  if (intent !== "record") return reply(false, "Unknown action.");

  const method = values.submissionId ? "submission" : values.fetchedHash === sha256(content) ? "auto" : "manual";
  const at = new Date();
  let saved: Awaited<ReturnType<typeof saveVersion>>;
  try {
    saved = await saveVersion(c, {
      platform: platformSlug,
      document: documentSlug,
      content,
      sourceUrl: values.sourceUrl || null,
      method,
      at,
      recordedBy: admin.email,
      touchUnchanged: false,
    });
  } catch (error) {
    if (error instanceof ConcurrentVersionError) {
      return reply(false, "Another version of this document was recorded at the same moment. Reload the page and check.");
    }
    throw error;
  }
  await recordCheck(c, {
    platform: platformSlug,
    document: documentSlug,
    outcome: saved.outcome,
    detail: `Recorded by ${admin.email}`,
    at,
    durationMs: 0,
  });
  if (values.submissionId) {
    await c.submissions.updateOne(
      { _id: new ObjectId(values.submissionId) },
      { $set: { status: "published", updatedAt: at, updatedBy: admin.email } },
    );
  }
  updateTag("versions");
  updateTag("status");

  if (saved.outcome === "changed") {
    // Write the AI summary after the response, so the admin isn't kept waiting.
    after(async () => {
      try {
        await summarizeVersion(c, saved.id);
        revalidateTag("summaries", "max");
      } catch (error) {
        console.error(`Summary for ${saved.id} failed: ${(error as Error).message}`);
      }
    });
  }
  redirect(`/admin/platforms/${platformSlug}/${documentSlug}?recorded=${saved.id.toHexString()}`);
}
