"use server";

import { ObjectId } from "mongodb";
import { updateTag } from "next/cache";
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
import { checkCredentials, endSession, requireAdmin, startSession } from "@/lib/auth.ts";
import { getDb } from "@/lib/db.ts";
import { clientIp, withinLimit } from "@/lib/limits.ts";
import { seal } from "@/lib/seal.ts";

/*
 * Every action here is a public POST endpoint, so each one checks the
 * session itself (requireAdmin) and validates its input. The form that
 * calls it being on an admin page is not a security check.
 */

export type FormState = { ok: boolean; message: string } | null;

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};
const isId = (id: string) => /^[a-f0-9]{24}$/.test(id);

/* ---------- Signing in and out ---------- */

export async function login(_previous: FormState, form: FormData): Promise<FormState> {
  const email = field(form, "email").trim().toLowerCase().slice(0, 254);
  const password = field(form, "password").slice(0, 256);
  if (!email || !password) return { ok: false, message: "Enter your email and password." };

  const ip = await clientIp();
  const allowed = (await withinLimit("login-ip", ip, 20, 900)) && (await withinLimit("login-email", email, 5, 900));
  if (!allowed) return { ok: false, message: "Too many attempts. Wait 15 minutes and try again." };

  const admin = await checkCredentials(email, password);
  if (!admin) return { ok: false, message: "That email and password don’t match an admin account." };

  await startSession(admin._id);
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin/login");
}

/* ---------- Submissions ---------- */

export async function updateSubmission(id: string, _previous: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isId(id)) return { ok: false, message: "Unknown submission." };
  const status = field(form, "status") as SubmissionStatus;
  if (!(status in STATUS_LABELS)) return { ok: false, message: "Choose a status." };
  const notes = field(form, "notes").replace(/\r\n?/g, "\n").trim();
  if (notes.length > 20_000) return { ok: false, message: "Notes are limited to 20,000 characters." };

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
  if (result.matchedCount === 0) return { ok: false, message: "This submission no longer exists." };
  return { ok: true, message: "Saved." };
}

export async function deleteSubmission(id: string, _previous: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
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
  const admin = await requireAdmin();
  if (!isId(id)) return { ok: false, message: "Unknown change." };

  const intent = field(form, "intent");
  if (intent !== "publish" && intent !== "hide") return { ok: false, message: "Unknown action." };
  const tidy = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim();
  const headline = tidy(field(form, "headline"));
  const points = field(form, "points")
    .split(/\r?\n/)
    .map((line) => tidy(line.replace(/^\s*[-*•]\s*/, "")))
    .filter(Boolean);

  if (intent === "publish") {
    if (!headline) return { ok: false, message: "Write a one-sentence headline." };
    if (headline.length > 300) return { ok: false, message: "Keep the headline under 300 characters." };
    if (points.length > 8) return { ok: false, message: "Use at most 8 points." };
    if (points.some((p) => p.length > 500)) return { ok: false, message: "Keep each point under 500 characters." };
  }

  const db = await getDb();
  const version = await db
    .collection<VersionRecord>(COLLECTIONS.versions)
    .findOne({ _id: new ObjectId(id), previousId: { $ne: null } }, { projection: { platform: 1, document: 1 } });
  if (!version) return { ok: false, message: "This change no longer exists." };

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
  return { ok: true, message: intent === "publish" ? "Published as reviewed." : "Hidden from the public site." };
}
