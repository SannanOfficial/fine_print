"use server";

import { ObjectId } from "mongodb";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  COLLECTIONS,
  type ChangeSummaryRecord,
  type SubmissionFileRecord,
  type SubmissionRecord,
  STATUS_LABELS,
  type SubmissionStatus,
  type VersionRecord,
} from "@/core/records.ts";
import { SummaryError } from "@/core/summarize.ts";
import { summarizeVersion } from "@/crawler/summary.ts";
import { adminForAction, checkCredentials, endSession, SESSION_EXPIRED, startSession } from "@/lib/auth.ts";
import { getDb } from "@/lib/db.ts";
import { clientIp, limitReached, withinLimit } from "@/lib/limits.ts";
import { seal } from "@/lib/seal.ts";
import { afterLogin } from "@/lib/session-cookie.ts";
import type { PlatformRecord } from "@/core/records.ts";

/*
 * Every action here is a public POST endpoint, so each one checks the
 * session itself (requireAdmin) and validates its input. The form that
 * calls it being on an admin page is not a security check.
 */

export type FormState = {
  ok: boolean;
  message: string;
  /** What was submitted, so the form can show it again rather than reset to the saved values. */
  values?: Record<string, string>;
  key?: number;
} | null;

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};
const isId = (id: string) => /^[a-f0-9]{24}$/.test(id);

/* ---------- Signing in and out ---------- */

/**
 * Checking a password is slow on purpose (scrypt), and runs on the same
 * small thread pool the server uses for everything else. A burst of sign-in
 * attempts must not tie it up, so only a few checks run at once and the rest
 * are turned away.
 */
let checking = 0;
const MAX_CHECKING = 3;

export async function login(_previous: FormState, form: FormData): Promise<FormState> {
  const email = field(form, "email").trim().toLowerCase().slice(0, 254);
  const password = field(form, "password").slice(0, 256);
  if (!email || !password) return { ok: false, message: "Enter your email and password." };

  const values = { email };
  const ip = await clientIp();
  const pair = `${email}|${ip}`;
  // Only failed attempts count, so signing in often is fine. The limit per
  // admin address applies only where that address has already failed, so a
  // stranger who knows an editor's email can't lock them out everywhere.
  const blocked =
    (await limitReached("login-ip", ip, 20, 900)) ||
    (await limitReached("login-email-ip", pair, 5, 900)) ||
    ((await limitReached("login-email-ip", pair, 1, 900)) && (await limitReached("login-email", email, 30, 900)));
  if (blocked) return { ok: false, message: "Too many failed attempts. Wait 15 minutes and try again.", values, key: Date.now() };

  if (checking >= MAX_CHECKING) {
    return { ok: false, message: "Too many sign-in attempts at once. Wait a few seconds and try again.", values, key: Date.now() };
  }
  checking++;
  let admin: Awaited<ReturnType<typeof checkCredentials>>;
  try {
    admin = await checkCredentials(email, password);
  } finally {
    checking--;
  }
  if (!admin) {
    await withinLimit("login-ip", ip, 20, 900);
    await withinLimit("login-email-ip", pair, 5, 900);
    await withinLimit("login-email", email, 30, 900);
    return { ok: false, message: "That email and password don’t match an admin account.", values, key: Date.now() };
  }

  await startSession(admin._id);
  redirect(afterLogin(field(form, "next")));
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin/login");
}

/* ---------- Submissions ---------- */

export async function updateSubmission(id: string, _previous: FormState, form: FormData): Promise<FormState> {
  const status = field(form, "status") as SubmissionStatus;
  const notes = field(form, "notes").replace(/\r\n?/g, "\n").trim();
  const reply = (ok: boolean, message: string): FormState => ({ ok, message, values: { status, notes }, key: Date.now() });
  const admin = await adminForAction();
  if (!admin) return reply(false, SESSION_EXPIRED);
  if (!isId(id)) return reply(false, "Unknown submission.");
  if (!Object.hasOwn(STATUS_LABELS, status)) return reply(false, "Choose a status.");
  if (notes.length > 20_000) return reply(false, "Notes are limited to 20,000 characters.");

  const result = await (await getDb()).collection<SubmissionRecord>(COLLECTIONS.submissions).updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status,
        notes: notes ? seal(notes, `notes:${id}`) : null,
        updatedAt: new Date(),
        updatedBy: admin.email,
      },
    },
  );
  if (result.matchedCount === 0) return reply(false, "This submission no longer exists.");
  refresh(); // the status shown above the form, and on the desk
  return reply(true, "Saved.");
}

/** One click after writing to the sender, so the desk shows who is waiting on whom. */
export async function markContacted(id: string): Promise<FormState> {
  const admin = await adminForAction();
  if (!admin) return { ok: false, message: SESSION_EXPIRED };
  if (!isId(id)) return { ok: false, message: "Unknown submission." };
  const result = await (await getDb())
    .collection<SubmissionRecord>(COLLECTIONS.submissions)
    .updateOne({ _id: new ObjectId(id), status: "new" }, { $set: { status: "contacted", updatedAt: new Date(), updatedBy: admin.email } });
  if (result.matchedCount === 0) return { ok: false, message: "This submission is no longer marked as new." };
  refresh();
  return { ok: true, message: "Marked as contacted." };
}

export async function deleteSubmission(id: string, _previous: FormState, form: FormData): Promise<FormState> {
  if (!(await adminForAction())) return { ok: false, message: SESSION_EXPIRED };
  if (!isId(id)) return { ok: false, message: "Unknown submission." };
  if (field(form, "confirm").trim().toLowerCase() !== "delete") {
    return { ok: false, message: "Type “delete” to confirm." };
  }
  const db = await getDb();
  const _id = new ObjectId(id);
  await db.collection<SubmissionFileRecord>(COLLECTIONS.submissionFiles).deleteMany({ submissionId: _id });
  await db.collection<SubmissionRecord>(COLLECTIONS.submissions).deleteOne({ _id });
  redirect("/admin?deleted=1");
}

/* ---------- Change summaries ---------- */

export async function saveSummary(id: string, _previous: FormState, form: FormData): Promise<FormState> {
  const values = { headline: field(form, "headline"), points: field(form, "points") };
  const reply = (ok: boolean, message: string): FormState => ({ ok, message, values, key: Date.now() });
  const admin = await adminForAction();
  if (!admin) return reply(false, SESSION_EXPIRED);
  if (!isId(id)) return reply(false, "Unknown change.");

  const intent = field(form, "intent");
  if (intent !== "publish" && intent !== "hide") return reply(false, "Unknown action.");
  const tidy = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim();
  const headline = tidy(field(form, "headline"));
  const points = field(form, "points")
    .split(/\r?\n/)
    .map((line) => tidy(line.replace(/^\s*[-*•]\s*/, "")))
    .filter(Boolean);

  if (intent === "publish") {
    if (!headline) return reply(false, "Write a one-sentence headline.");
    if (headline.length > 300) return reply(false, "Keep the headline under 300 characters.");
    if (points.length > 8) return reply(false, "Use at most 8 points.");
    if (points.some((p) => p.length > 500)) return reply(false, "Keep each point under 500 characters.");
  }

  const db = await getDb();
  const version = await db
    .collection<VersionRecord>(COLLECTIONS.versions)
    .findOne({ _id: new ObjectId(id), previousId: { $ne: null } }, { projection: { platform: 1, document: 1 } });
  if (!version) return reply(false, "This change no longer exists.");

  const summaries = db.collection<ChangeSummaryRecord>(COLLECTIONS.summaries);
  const existing = await summaries.findOne({ _id: version._id }, { projection: { headline: 1, points: 1 } });
  await summaries.updateOne(
    { _id: version._id },
    {
      $set: {
        platform: version.platform,
        document: version.document,
        // Hiding keeps the existing wording, so it can be restored later.
        headline: intent === "publish" ? headline : (existing?.headline ?? headline),
        points: intent === "publish" ? points : (existing?.points ?? points),
        state: intent === "publish" ? "reviewed" : "hidden",
        updatedAt: new Date(),
        updatedBy: admin.email,
      },
      $setOnInsert: { model: null, generatedAt: null },
    },
    { upsert: true },
  );
  updateTag("summaries");
  return reply(true, intent === "publish" ? "Published as reviewed." : "Hidden from the public site.");
}

/** Ask the AI for a new draft, replacing whatever is there (including reviewed text). */
export async function redraftSummary(id: string, _previous: FormState, form: FormData): Promise<FormState> {
  if (!(await adminForAction())) return { ok: false, message: SESSION_EXPIRED };
  if (!isId(id)) return { ok: false, message: "Unknown change." };
  if (form.get("confirm") !== "yes") return { ok: false, message: "Tick the box to confirm the current summary may be replaced." };
  if (!process.env.OPENAI_API_KEY) return { ok: false, message: "AI drafts aren't set up on this server (OPENAI_API_KEY is not set)." };
  const db = await getDb();
  try {
    const result = await summarizeVersion(
      {
        platforms: db.collection<PlatformRecord>(COLLECTIONS.platforms),
        versions: db.collection<VersionRecord>(COLLECTIONS.versions),
        summaries: db.collection<ChangeSummaryRecord>(COLLECTIONS.summaries),
      },
      new ObjectId(id),
      { force: true },
    );
    if (result !== "written") return { ok: false, message: "There is nothing to summarise for this change." };
  } catch (error) {
    console.error(`Summary for ${id} failed: ${(error as Error).message}`);
    // Some failures need an editor, not another try (a draft that named an address, changes too long to send).
    if (error instanceof SummaryError && /by hand/.test(error.message)) return { ok: false, message: error.message };
    return { ok: false, message: "The AI draft failed. Try again in a minute." };
  }
  updateTag("summaries");
  return { ok: true, message: "New AI draft written. Check it against the redline, then publish it as reviewed." };
}
