import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { DUMMY_HASH, verifyPassword } from "@/core/password.ts";
import { COLLECTIONS, type AdminRecord, type SessionRecord } from "@/core/records.ts";
import { getDb } from "./db.ts";
import { SESSION_COOKIE } from "./session-cookie.ts";

/*
 * Admin sessions. A random token lives in an HttpOnly, SameSite=Strict
 * cookie; the database keeps only its SHA-256, so a database leak does not
 * hand out live sessions. Sessions last 12 hours and are removed on sign-out,
 * password reset or when an admin is disabled.
 */

const SECURE = process.env.NODE_ENV === "production";
const SESSION_HOURS = 12;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export interface Admin {
  id: string;
  email: string;
  name: string;
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

async function db() {
  const d = await getDb();
  return {
    admins: d.collection<AdminRecord>(COLLECTIONS.admins),
    sessions: d.collection<SessionRecord>(COLLECTIONS.sessions),
  };
}

/** Check an email and password. Takes the same time whether or not the email exists. */
export async function checkCredentials(email: string, password: string): Promise<AdminRecord | null> {
  const { admins } = await db();
  const admin = await admins.findOne({ email: email.trim().toLowerCase() });
  const ok = await verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH);
  return ok && admin && !admin.disabledAt ? admin : null;
}

export async function startSession(adminId: ObjectId): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 3600_000);
  await (await db()).sessions.insertOne({ _id: tokenHash(token), adminId, createdAt: now, expiresAt });
  (await cookies()).set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: SECURE,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && TOKEN.test(token)) await (await db()).sessions.deleteOne({ _id: tokenHash(token) });
  store.delete(SESSION_COOKIE);
}

/** The signed-in admin, or null. Looked up once per request. */
export const currentAdmin = cache(async (): Promise<Admin | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !TOKEN.test(token)) return null;
  await connection(); // the expiry check reads the clock, which must happen at request time
  const { admins, sessions } = await db();
  const session = await sessions.findOne({ _id: tokenHash(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const admin = await admins.findOne({ _id: session.adminId, disabledAt: null });
  return admin ? { id: admin._id.toHexString(), email: admin.email, name: admin.name } : null;
});

/**
 * Use at the top of every admin page, server action and route handler.
 * Hiding a link is not a security check; this is.
 */
export async function requireAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/**
 * For server actions that return a message: null when signed out, so the
 * action can say so and give the editor's input back instead of redirecting
 * away from a half-filled form.
 */
export async function adminForAction(): Promise<Admin | null> {
  return currentAdmin();
}

export const SESSION_EXPIRED =
  "You've been signed out. Sign in again in a new tab (your work here is kept), then press the button again.";
