"use server";

import { timingSafeEqual } from "node:crypto";
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
  SLUG,
  type Audience,
  type TrackedDocument,
} from "@/core/platforms.ts";
import {
  COLLECTIONS,
  type ChangeStats,
  type ChangeSummaryRecord,
  type CheckRecord,
  type EventRecord,
  type PlatformRecord,
  type StatusRecord,
  type SubmissionRecord,
  type SubscriberRecord,
  type VersionRecord,
} from "@/core/records.ts";
import { sha256 } from "@/core/hash.ts";
import { normalizeMarkdown } from "@/core/text.ts";
import { fetchDocument } from "@/crawler/check.ts";
import { ExtractionError, extractDocument } from "@/crawler/extract.ts";
import { decodeBody } from "@/crawler/fetch.ts";
import { sameWording } from "@/crawler/check.ts";
import { ConcurrentVersionError, latestVersion, recordCheck, saveVersion } from "@/crawler/record.ts";
import { RobotsCache } from "@/crawler/robots.ts";
import { summarizeVersion } from "@/crawler/summary.ts";
import { adminForAction, SESSION_EXPIRED } from "@/lib/auth.ts";
import { getDb } from "@/lib/db.ts";
import { forgetKnownPaths } from "@/lib/known-paths.ts";
import { keyedHash } from "@/lib/seal.ts";
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
/** Bound arguments arrive from the client too, so check they're plain short names before they reach a query. */
const isSlug = (value: unknown): value is string => typeof value === "string" && value.length <= 60 && SLUG.test(value);
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
    subscribers: db.collection<SubscriberRecord>(COLLECTIONS.subscribers),
    events: db.collection<EventRecord>(COLLECTIONS.events),
  };
}

/** The public site and the proxy's list of addresses both change. */
function registryChanged() {
  updateTag("registry");
  forgetKnownPaths();
}

/** Old check results for an address that no longer exists, so a re-added one starts clean. Best effort. */
async function forgetStatus(c: Awaited<ReturnType<typeof collections>>, filter: { _id: string | { $regex: string } }) {
  try {
    await c.status.deleteMany(filter);
  } catch (error) {
    console.error(`Could not clear old check status: ${(error as Error).message}`);
  }
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
  const values = platformValues(form);
  const fail = (message: string): PlatformState => ({ ok: false, message, values, key: Date.now() });
  const admin = await adminForAction();
  if (!admin) return fail(SESSION_EXPIRED);
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
  const values = platformValues(form, isSlug(slug) ? slug : "");
  const admin = await adminForAction();
  if (!admin) return { ok: false, message: SESSION_EXPIRED, values, key: Date.now() };
  if (!isSlug(slug)) return { ok: false, message: "This platform no longer exists.", values, key: Date.now() };
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
  if (!(await adminForAction())) return { ok: false, message: SESSION_EXPIRED };
  if (!isSlug(slug)) return { ok: false, message: "This platform no longer exists." };
  if (field(form, "confirm") !== slug) return { ok: false, message: `Type “${slug}” to confirm.` };
  const c = await collections();
  if (await c.versions.findOne({ platform: slug }, { projection: { _id: 1 } })) {
    return { ok: false, message: "This platform has versions on the record, so it can't be deleted." };
  }
  await c.platforms.deleteOne({ _id: slug });
  // Short names are letters, digits and hyphens only, so the slug is safe inside the pattern.
  await forgetStatus(c, { _id: { $regex: `^${slug}/` } });
  // Nobody can follow a platform that's gone; addresses left following nothing are deleted.
  await c.subscribers.updateMany({ platforms: slug }, { $pull: { platforms: slug } });
  await c.subscribers.deleteMany({ platforms: { $size: 0 }, expiresAt: null });
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
  const values = documentValues(form);
  const fail = (message: string): DocumentState => ({ ok: false, message, values, key: Date.now() });
  const admin = await adminForAction();
  if (!admin) return fail(SESSION_EXPIRED);
  if (!isSlug(platformSlug)) return fail("This platform no longer exists.");
  const doc = toDocument(values);
  const problems = documentProblems(doc);
  if (problems.length) return fail(problems.join(" "));

  const c = await collections();
  const result = await c.platforms.updateOne(
    { _id: platformSlug, "documents.slug": { $ne: doc.slug } },
    { $push: { documents: doc }, $set: { updatedAt: new Date(), updatedBy: admin.email } },
  );
  if (result.matchedCount === 0) {
    const exists = await c.platforms.findOne({ _id: platformSlug }, { projection: { _id: 1 } });
    return fail(exists ? `This platform already has a document called “${doc.slug}”.` : "This platform no longer exists.");
  }
  await forgetStatus(c, { _id: `${platformSlug}/${doc.slug}` });
  registryChanged();
  redirect(`/admin/platforms/${platformSlug}/${doc.slug}?added=document`);
}

export async function updateDocument(
  platformSlug: string,
  documentSlug: string,
  _previous: DocumentState,
  form: FormData,
): Promise<DocumentState> {
  const values = documentValues(form, isSlug(documentSlug) ? documentSlug : "");
  const admin = await adminForAction();
  if (!admin) return { ok: false, message: SESSION_EXPIRED, values, key: Date.now() };
  if (!isSlug(platformSlug) || !isSlug(documentSlug)) return { ok: false, message: "This document no longer exists.", values, key: Date.now() };
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
  const admin = await adminForAction();
  if (!admin) return { ok: false, message: SESSION_EXPIRED };
  if (!isSlug(platformSlug) || !isSlug(documentSlug)) return { ok: false, message: "This document no longer exists." };
  if (field(form, "confirm") !== documentSlug) return { ok: false, message: `Type “${documentSlug}” to confirm.` };
  const c = await collections();
  if (await c.versions.findOne({ platform: platformSlug, document: documentSlug }, { projection: { _id: 1 } })) {
    return { ok: false, message: "This document has versions on the record, so it can't be deleted." };
  }
  await c.platforms.updateOne(
    { _id: platformSlug },
    { $pull: { documents: { slug: documentSlug } }, $set: { updatedAt: new Date(), updatedBy: admin.email } },
  );
  await forgetStatus(c, { _id: `${platformSlug}/${documentSlug}` });
  registryChanged();
  redirect(`/admin/platforms/${platformSlug}?deleted=document`);
}

/* ---------- Recording a version ---------- */

/*
 * Text fetched from the public page is recorded as an automatic capture. The
 * form carries a proof of that, signed by the server, because a hidden field
 * the browser could fill in itself must not decide what the record says
 * about where text came from. Proofs last 12 hours.
 */
const FETCH_PROOF_MS = 12 * 60 * 60 * 1000;
function fetchProof(platform: string, document: string, content: string, at: number): string {
  return `${at}.${keyedHash(`fetched:${platform}/${document}:${at}:${sha256(content)}`)}`;
}
function isFetchProof(proof: string, platform: string, document: string, content: string): boolean {
  const [at, mac = ""] = proof.split(".");
  const when = Number(at);
  if (!Number.isSafeInteger(when) || when > Date.now() + 60_000 || Date.now() - when > FETCH_PROOF_MS) return false;
  const expected = fetchProof(platform, document, content, when).split(".")[1];
  return mac.length === expected.length && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

export type RecordValues = {
  text: string;
  sourceUrl: string;
  /** The server's signed proof that `text` was fetched from the public page (see fetchProof), or "". */
  fetchedHash: string;
  submissionId: string;
  datedOn: string;
  /** The version the last preview compared against ("none" for a first copy), so recording can tell if it moved on. */
  basedOn: string;
};

/** "YYYY-MM-DD" for a real date between 1990 and today, or null. A day of slack covers time zones ahead of UTC. */
function validDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  if (date.getUTCFullYear() < 1990 || date.getTime() > Date.now() + 86_400_000) return null;
  return value;
}
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
  const intent = field(form, "intent");
  const values: RecordValues = {
    text: (typeof form.get("text") === "string" ? (form.get("text") as string) : "").slice(0, MAX_TEXT_CHARS + 1),
    sourceUrl: field(form, "sourceUrl"),
    fetchedHash: field(form, "fetchedHash"),
    submissionId: /^[a-f0-9]{24}$/.test(field(form, "submissionId")) ? field(form, "submissionId") : "",
    datedOn: field(form, "datedOn"),
    basedOn: field(form, "basedOn"),
  };
  const reply = (ok: boolean, message: string, extra: Partial<NonNullable<RecordState>> = {}): RecordState => ({
    ok,
    message,
    values,
    key: Date.now(),
    ...extra,
  });
  const admin = await adminForAction();
  if (!admin) return reply(false, SESSION_EXPIRED);
  if (!isSlug(platformSlug) || !isSlug(documentSlug)) return reply(false, "This document no longer exists.");

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
    values.fetchedHash = fetchProof(platformSlug, documentSlug, result.content, Date.now());
    values.sourceUrl = doc.url;
    return reply(true, `Read ${result.content.length.toLocaleString("en-US")} characters from the page. Check the text, then preview the changes.`);
  }

  if (intent === "extract") {
    const file = form.get("page");
    if (!(file instanceof File) || file.size === 0) return reply(false, "Choose a saved page (.html) first.");
    if (file.size > MAX_PAGE_BYTES) return reply(false, "That file is over 5 MB. Save the page as “Webpage, HTML only”.");
    const bytes = Buffer.from(await file.arrayBuffer());
    // Images, PDFs and other binary files have zero bytes early on; web pages never do.
    if (bytes.subarray(0, 4096).includes(0)) return reply(false, "That file isn't a saved web page (it isn't readable text).");
    // Saved pages keep their original encoding, which isn't always UTF-8.
    const html = decodeBody(bytes, "");
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
  if (values.datedOn && !validDate(values.datedOn)) return reply(false, "The date on the document must be a real date, no later than today.");

  const previous = await latestVersion(c, platformSlug, documentSlug);
  if (previous && previous.hash === sha256(content)) {
    return reply(false, "This text is identical to the latest version on the record, so there is nothing to add.");
  }
  if (previous && sameWording(previous.content, content)) {
    return reply(false, "The wording is the same as the latest version on the record; only link addresses, typography or formatting differ. There is nothing to add.");
  }

  // Text straight from the public page counts as an automatic capture, whoever pressed the button.
  const fromPage = Boolean(values.fetchedHash) && isFetchProof(values.fetchedHash, platformSlug, documentSlug, content);
  const method = fromPage ? "auto" : values.submissionId ? "submission" : "manual";
  if (fromPage && doc.url) values.sourceUrl = doc.url;
  const basedOn = previous?._id.toHexString() ?? "none";

  const preview = (message: string) => {
    const entries = previous ? diffDocuments(previous.content, content) : [];
    const shrank = previous && content.length < previous.content.length * 0.5;
    // The crawler compares the public page with the newest version, whatever its source.
    const offPage = doc.mode === "auto" && method !== "auto";
    values.basedOn = basedOn;
    return reply(
      true,
      [
        message,
        previous
          ? "This would be recorded as a change."
          : "This would be the first copy of this document on the record.",
        shrank ? "Careful: it is less than half the length of the current version. Make sure nothing is missing." : "",
        offPage
          ? "Note: this document is checked automatically. If this text isn't what the public page says, the next check will record the public page again as another change. Record emailed or private terms under their own document, set to “By hand”."
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      { preview: { stats: previous ? summarize(entries) : null, entries, chars: content.length } },
    );
  };

  if (intent === "preview") return preview("");
  if (intent !== "record") return reply(false, "Unknown action.");
  if (values.basedOn !== basedOn) {
    return preview("A newer version was recorded since your preview, so the changes below are against that one. Check them again.");
  }

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
      datedOn: values.datedOn || null,
      touchUnchanged: false,
      expectedPreviousId: previous?._id ?? null,
    });
  } catch (error) {
    if (error instanceof ConcurrentVersionError) {
      values.basedOn = "";
      return reply(false, "Another version of this document was recorded a moment ago. Preview again to see the changes against it.");
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
      {
        $set: {
          status: "published",
          updatedAt: at,
          updatedBy: admin.email,
          recordedAs: { platform: platformSlug, document: documentSlug, id: saved.id },
        },
      },
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
  const recorded = saved.id.toHexString();
  // Only two fixed destinations, never an address taken from the form.
  redirect(
    field(form, "returnTo") === "record-page"
      ? `/admin/record?doc=${platformSlug}/${documentSlug}&recorded=${recorded}`
      : `/admin/platforms/${platformSlug}/${documentSlug}?recorded=${recorded}`,
  );
}

/* ---------- Reported events ---------- */

export type EventValues = { date: string; precision: string; title: string; body: string; sources: string };
export type EventState = { ok: boolean; message: string; values: EventValues; key: number } | null;

/** "Label | https://…" per line, as typed in the form. */
function parseSources(text: string): { label: string; url: string }[] | string {
  const sources = [];
  for (const line of lines(text)) {
    const bar = line.lastIndexOf("|");
    const [label, url] = bar < 0 ? [line.trim(), ""] : [line.slice(0, bar).trim(), line.slice(bar + 1).trim()];
    if (!label || !url) return `Write each source as "Label | https://address": "${line.slice(0, 60)}" isn't.`;
    if (!isHttpsUrl(url)) return `Source addresses must start with https://: "${url.slice(0, 60)}".`;
    if (label.length > 120) return "Keep each source's label under 120 characters.";
    sources.push({ label, url });
  }
  return sources;
}

/**
 * An event on a company's timeline: something reported about its terms that
 * isn't a document's text, such as a contract sent privately or a rollout
 * paused. Every event cites where it was reported.
 */
export async function addEvent(platformSlug: string, _previous: EventState, form: FormData): Promise<EventState> {
  const values: EventValues = {
    date: field(form, "date"),
    precision: field(form, "precision") === "month" ? "month" : "day",
    title: field(form, "title"),
    body: (typeof form.get("body") === "string" ? (form.get("body") as string) : "").replace(/\r\n?/g, "\n").trim(),
    sources: field(form, "sources"),
  };
  const fail = (message: string): EventState => ({ ok: false, message, values, key: Date.now() });
  const admin = await adminForAction();
  if (!admin) return fail(SESSION_EXPIRED);
  if (!isSlug(platformSlug)) return fail("This platform no longer exists.");
  if (!validDate(values.date)) return fail("Enter the date it happened (a real date, no later than today). For a month, use any day in it.");
  if (values.title.length < 3 || values.title.length > 200) return fail("Give the event a short title (up to 200 characters).");
  if (!values.body || values.body.length > 4000) return fail("Describe what happened in up to 4,000 characters.");
  const sources = parseSources(values.sources);
  if (typeof sources === "string") return fail(sources);
  if (sources.length === 0 || sources.length > 8) return fail("Cite between one and eight sources, one per line.");

  const c = await collections();
  if (!(await c.platforms.findOne({ _id: platformSlug }, { projection: { _id: 1 } }))) return fail("This platform no longer exists.");
  const now = new Date();
  await c.events.insertOne({
    _id: new ObjectId(),
    platform: platformSlug,
    date: values.precision === "month" ? `${values.date.slice(0, 7)}-01` : values.date,
    precision: values.precision as "day" | "month",
    title: values.title,
    body: values.body,
    sources,
    createdAt: now,
    updatedAt: now,
    updatedBy: admin.email,
  });
  updateTag("events");
  return { ok: true, message: "Added to the timeline.", values: { date: "", precision: "day", title: "", body: "", sources: "" }, key: Date.now() };
}

export async function deleteEvent(platformSlug: string, id: string, _previous: SimpleState, form: FormData): Promise<SimpleState> {
  if (!(await adminForAction())) return { ok: false, message: SESSION_EXPIRED };
  if (!isSlug(platformSlug) || !/^[a-f0-9]{24}$/.test(id)) return { ok: false, message: "This event no longer exists." };
  if (field(form, "confirm") !== "delete") return { ok: false, message: "Type \u201cdelete\u201d to confirm." };
  const result = await (await collections()).events.deleteOne({ _id: new ObjectId(id), platform: platformSlug });
  if (result.deletedCount === 0) return { ok: false, message: "This event no longer exists." };
  updateTag("events");
  return { ok: true, message: "Removed from the timeline." };
}
