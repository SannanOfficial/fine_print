"use server";

import { randomInt, randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { mailConfigured, sendMail, siteUrl } from "@/core/mailer.ts";
import { receiptEmail } from "@/core/newsletter-email.ts";
import { contactEmail } from "@/core/site.ts";
import { getPlatform } from "@/lib/registry.ts";
import {
  COLLECTIONS,
  SHOWN_VIA,
  type ShownVia,
  type SubmissionDetails,
  type SubmissionFileRecord,
  type SubmissionRecord,
} from "@/core/records.ts";
import { getDb } from "@/lib/db.ts";
import { clientIp, withinLimit } from "@/lib/limits.ts";
import { seal, sealJson } from "@/lib/seal.ts";
import { LIMITS, type SubmitState, type SubmitValues } from "./limits.ts";

/** File types we accept, recognised by their first bytes rather than their name. */
function detectType(bytes: Buffer, name: string): string | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "txt" || ext === "eml") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!text.includes("\u0000")) return ext === "eml" ? "message/rfc822" : "text/plain";
    } catch {
      return null;
    }
  }
  return null;
}

const safeFileName = (name: string) =>
  name.replace(/[^\w.\- ()]+/g, "_").replace(/^\.+/, "").slice(0, 100) || "attachment";

/** "FP-7KQ3-9XZ2": no 0/O or 1/I/L, so it can be read out over the phone. */
function newReference(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const pick = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `FP-${pick()}-${pick()}`;
}

const text = (form: FormData, field: string) => {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
};

export async function submitAgreement(_previous: SubmitState, form: FormData): Promise<SubmitState> {
  const values: SubmitValues = {
    platform: text(form, "platform"),
    platformOther: text(form, "platformOther"),
    documentName: text(form, "documentName"),
    receivedOn: text(form, "receivedOn"),
    shownVia: text(form, "shownVia"),
    text: (typeof form.get("text") === "string" ? (form.get("text") as string) : "").replace(/\r\n?/g, "\n").trim(),
    name: text(form, "name"),
    email: text(form, "email"),
    phone: text(form, "phone"),
    profession: text(form, "profession"),
    prefers: text(form, "prefers") === "phone" ? "phone" : "email",
    noPatientInfo: form.get("noPatientInfo") === "on",
    contactOk: form.get("contactOk") === "on",
  };
  const errors: Record<string, string> = {};
  // A fresh key re-creates the form, so it shows the answers sent back here.
  const fail = (message: string): SubmitState => ({ status: "error", message, errors, values, key: randomUUID() });

  // Bots fill in every field, including this one, which people never see.
  if (text(form, "website")) return { status: "sent", reference: newReference(), email: values.email, phone: "", prefers: "email", emailed: false };

  // ----- What was shown -----
  if (values.platform !== "other" && !(await getPlatform(values.platform))) errors.platform = "Choose the platform.";
  if (values.platform === "other" && !values.platformOther) errors.platformOther = "Name the platform.";
  if (values.platformOther.length > LIMITS.short) errors.platformOther = `Keep this under ${LIMITS.short} characters.`;
  if (!values.documentName) errors.documentName = "Say briefly what you were shown.";
  if (values.documentName.length > LIMITS.medium) errors.documentName = `Keep this under ${LIMITS.medium} characters.`;
  if (values.receivedOn) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(values.receivedOn) ? new Date(`${values.receivedOn}T00:00:00Z`) : null;
    if (!day || Number.isNaN(day.getTime()) || day.getTime() > Date.now() + 86_400_000 || day.getUTCFullYear() < 2000) {
      errors.receivedOn = "Enter a real date, not in the future.";
    }
  }
  if (!Object.hasOwn(SHOWN_VIA, values.shownVia)) errors.shownVia = "Choose how you were shown it.";
  if (values.text.length > LIMITS.text) errors.text = `Paste at most ${LIMITS.text.toLocaleString("en-US")} characters, or attach a file instead.`;

  // ----- Files -----
  const uploads = form.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
  const files: { id: ObjectId; name: string; type: string; bytes: Buffer }[] = [];
  if (uploads.length > LIMITS.files) errors.files = `Attach at most ${LIMITS.files} files.`;
  else if (uploads.reduce((n, f) => n + f.size, 0) > LIMITS.totalBytes) errors.files = "The files are larger than 8 MB together.";
  else {
    for (const file of uploads) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const type = detectType(bytes, file.name);
      if (!type) {
        errors.files = `“${safeFileName(file.name)}” is not a PDF, image (PNG, JPEG, WebP), .txt or .eml file.`;
        break;
      }
      files.push({ id: new ObjectId(), name: safeFileName(file.name), type, bytes });
    }
  }
  if (!values.text && uploads.length === 0) errors.text = "Paste the text or attach at least one file.";

  // ----- Contact -----
  if (!values.name) errors.name = "Enter your name.";
  if (values.name.length > LIMITS.short) errors.name = `Keep this under ${LIMITS.short} characters.`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254) errors.email = "Enter an email address we can reach you at.";
  if (values.phone.length > 40 || (values.phone && !/^[\d\s()+.\-x]+$/i.test(values.phone))) errors.phone = "Enter a phone number, or leave it blank.";
  if (values.prefers === "phone" && !values.phone) errors.phone = "Add a phone number, or choose email.";
  if (values.profession.length > LIMITS.short) errors.profession = `Keep this under ${LIMITS.short} characters.`;
  if (!values.noPatientInfo) errors.noPatientInfo = "Please confirm there is no patient information.";
  if (!values.contactOk) errors.contactOk = "We need to be able to contact you to confirm the submission.";

  if (Object.keys(errors).length > 0) {
    return fail(
      uploads.length > 0
        ? "Some answers need attention. Your files were not kept, so please attach them again."
        : "Some answers need attention.",
    );
  }

  // Counted only once the answers are complete, so fixing mistakes never uses up the limit.
  const ip = await clientIp();
  if (!(await withinLimit("submit-hour", ip, 5, 3600))) {
    return fail("We have received several submissions from your connection in the last hour. Please try again in an hour.");
  }
  if (!(await withinLimit("submit-day", ip, 20, 86_400)) || !(await withinLimit("submit-all", "all", 500, 86_400))) {
    return fail("We have received a lot of submissions today. Please try again tomorrow.");
  }

  // ----- Save, encrypted -----
  const db = await getDb();
  const id = new ObjectId();
  const now = new Date();
  const details: SubmissionDetails = {
    documentName: values.documentName,
    receivedOn: values.receivedOn || null,
    shownVia: values.shownVia as ShownVia,
    text: values.text,
    files: files.map((f) => ({ id: f.id.toHexString(), name: f.name, type: f.type, size: f.bytes.length })),
    contact: {
      name: values.name,
      email: values.email,
      phone: values.phone,
      profession: values.profession,
      prefers: values.prefers,
    },
  };

  const fileStore = db.collection<SubmissionFileRecord>(COLLECTIONS.submissionFiles);
  let sent: SubmitState;
  try {
    if (files.length > 0) {
      await fileStore.insertMany(
        files.map((f) => ({
          _id: f.id,
          submissionId: id,
          type: f.type,
          size: f.bytes.length,
          sealed: seal(f.bytes, `file:${f.id.toHexString()}`),
        })),
      );
    }
    let reference = newReference();
    for (let attempt = 0; ; attempt++) {
      try {
        await db.collection<SubmissionRecord>(COLLECTIONS.submissions).insertOne({
          _id: id,
          reference,
          receivedAt: now,
          platform: values.platform,
          platformOther: values.platform === "other" ? values.platformOther : null,
          status: "new",
          updatedAt: now,
          updatedBy: null,
          sealed: sealJson(details, `submission:${id.toHexString()}`),
          notes: null,
        });
        break;
      } catch (error) {
        // Reference already taken (about one in a trillion): pick another.
        if ((error as { code?: number }).code !== 11000 || attempt > 3) throw error;
        reference = newReference();
      }
    }
    // A receipt, so the sender has the reference and knows we can reach them. Sent after the reply.
    // At most three a day to one address, so the form can't be used to flood someone's inbox.
    const emailed = mailConfigured() && (await withinLimit("submit-receipt", values.email.toLowerCase(), 3, 86_400));
    if (emailed) {
      const to = values.email;
      const ref = reference;
      after(async () => {
        try {
          await sendMail({ to, ...receiptEmail({ reference: ref, siteUrl: siteUrl()!, contact: contactEmail() }) });
        } catch (error) {
          console.error(`Submission receipt email failed: ${(error as Error).message}`);
        }
      });
    }
    sent = { status: "sent", reference, email: values.email, phone: values.phone, prefers: values.prefers, emailed };
  } catch (error) {
    console.error("Saving a submission failed:", (error as Error).message);
    // Don't leave files behind without the submission they belong to.
    await fileStore.deleteMany({ submissionId: id }).catch(() => {});
    return fail("We could not save your submission just now. Nothing was stored. Please try again in a few minutes.");
  }
  // A browser without JavaScript posts the form itself (no Next-Action header), and this
  // page can't show it the receipt, so it goes to one. Only the reference is in the address.
  if (!(await headers()).has("next-action")) redirect(`/submit/received?ref=${sent.reference}`);
  return sent;
}
