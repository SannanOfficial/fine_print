"use server";

import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { confirmEmail } from "@/core/newsletter-email.ts";
import { confirmToken, EVERY_PLATFORM, manageToken, readToken } from "@/core/newsletter-links.ts";
import { mailConfigured, sendMail, siteUrl as configuredSiteUrl } from "@/core/mailer.ts";
import { COLLECTIONS, type SubscriberRecord } from "@/core/records.ts";
import { getDb } from "@/lib/db.ts";
import { clientIp, withinLimit } from "@/lib/limits.ts";
import { getPlatform, getPlatforms } from "@/lib/registry.ts";
import { keyedHash, seal } from "@/lib/seal.ts";

/*
 * Newsletter sign-up and preferences. Nothing is ever sent to an address
 * until its owner clicks the confirmation link, and the reply to a sign-up is
 * the same whether or not the address is already subscribed, so the form
 * can't be used to find out who follows what.
 */

const siteUrl = () => configuredSiteUrl() ?? "http://localhost:3000"; // only used once mailConfigured() is true
const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
const PENDING_DAYS = 7;

async function subscribers() {
  return (await getDb()).collection<SubscriberRecord>(COLLECTIONS.subscribers);
}

// Not exported: every export of a "use server" file is a public endpoint.
const emailHash = (email: string) => keyedHash(`email:${email}`);

export type SubscribeState = { ok: boolean; message: string; key: number; email?: string } | null;

/** `platformSlug` is one platform, or EVERY_PLATFORM for the sign-up on the home page. */
export async function subscribe(platformSlug: string, _previous: SubscribeState, form: FormData): Promise<SubscribeState> {
  const raw = form.get("email");
  const email = (typeof raw === "string" ? raw : "").trim().toLowerCase();
  const reply = (ok: boolean, message: string): SubscribeState => ({ ok, message, key: Date.now(), email });
  const sent = reply(true, `Almost done: we sent a link to ${email}. Open it and press “Confirm”. Nothing is sent until you do.`);

  // Bots fill in every field, including this one, which people never see.
  if (form.get("website")) return sent;
  if (!email || email.length > 254 || !EMAIL.test(email)) return reply(false, "Enter a valid email address.");
  const everything = platformSlug === EVERY_PLATFORM;
  const platform = everything ? null : await getPlatform(platformSlug);
  if (!everything && !platform) return reply(false, "This platform is no longer tracked.");
  if (!mailConfigured()) return reply(false, "Email updates aren't switched on yet. Please try again later.");

  const ip = await clientIp();
  const allowed =
    (await withinLimit("newsletter-ip", ip, 10, 3600)) &&
    (await withinLimit("newsletter-email-hour", email, 3, 3600)) &&
    (await withinLimit("newsletter-email-day", email, 8, 86_400)) &&
    // An overall cap, so many addresses from many places can't burn the sending domain's reputation.
    (await withinLimit("newsletter-all", "all", 500, 86_400));
  if (!allowed) return reply(false, "Too many sign-ups right now. Please try again in an hour.");

  const col = await subscribers();
  const hash = emailHash(email);
  const now = new Date();
  let subscriber = await col.findOne({ emailHash: hash });
  if (!subscriber) {
    const _id = new ObjectId();
    const record: SubscriberRecord = {
      _id,
      emailHash: hash,
      email: seal(email, `subscriber:${_id.toHexString()}`),
      platforms: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + PENDING_DAYS * 86_400_000),
      digestCursor: null,
      lastSentAt: null,
      tokenVersion: 1,
    };
    try {
      await col.insertOne(record);
      subscriber = record;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      subscriber = await col.findOne({ emailHash: hash }); // signed up at the same moment
    }
  } else if (subscriber.expiresAt) {
    // Still unconfirmed: keep it for another week.
    await col.updateOne({ _id: subscriber._id }, { $set: { expiresAt: new Date(now.getTime() + PENDING_DAYS * 86_400_000) } });
  }
  if (!subscriber) return reply(false, "Something went wrong. Please try again.");

  const token = confirmToken(subscriber._id.toHexString(), subscriber.tokenVersion, platform?.slug ?? EVERY_PLATFORM);
  try {
    await sendMail({
      to: email,
      ...confirmEmail({ platformName: platform?.name ?? null, confirmUrl: `${siteUrl()}/newsletter/confirm?t=${token}`, siteUrl: siteUrl() }),
    });
  } catch (error) {
    console.error(`Newsletter confirmation email failed: ${(error as Error).message}`);
    return reply(false, "We couldn't send the confirmation email. Please try again later.");
  }
  return sent;
}

/* ---------- Confirming ---------- */

export type LinkState = { ok: boolean; message: string; manageUrl?: string } | null;

export async function confirmSubscription(token: string): Promise<LinkState> {
  const link = readToken(token);
  if (link?.k !== "confirm") return { ok: false, message: "This link has expired or isn't valid. Sign up again from the home page or a platform's page." };
  const everything = link.p === EVERY_PLATFORM;
  const platform = everything ? null : await getPlatform(link.p);
  if (!everything && !platform) return { ok: false, message: "That platform is no longer tracked." };
  const slugs = platform ? [platform.slug] : (await getPlatforms()).map((p) => p.slug);

  const result = await (await subscribers()).updateOne(
    { _id: new ObjectId(link.s), tokenVersion: link.v },
    {
      $addToSet: { platforms: { $each: slugs } },
      $set: { expiresAt: null, updatedAt: new Date(), ...(everything ? { allPlatforms: true } : {}) },
    },
  );
  if (result.matchedCount === 0) {
    return { ok: false, message: "This link is no longer valid, perhaps because you unsubscribed. Sign up again from the home page or a platform's page." };
  }
  return {
    ok: true,
    message: platform
      ? `Subscribed. You'll get an email in any week that ${platform.name} changes its terms.`
      : "Subscribed. You'll get an email in any week that a platform we track changes its terms.",
    manageUrl: `/newsletter/manage?t=${manageToken(link.s, link.v)}`,
  };
}

/* ---------- Managing ---------- */

async function subscriberFor(token: string) {
  const link = readToken(token);
  if (link?.k !== "manage") return null;
  return (await subscribers()).findOne({ _id: new ObjectId(link.s), tokenVersion: link.v });
}

export async function savePreferences(token: string, _previous: LinkState, form: FormData): Promise<LinkState> {
  const subscriber = await subscriberFor(token);
  if (!subscriber) return { ok: false, message: "This link isn't valid any more. Use the link in your latest email." };
  const known = new Set((await getPlatforms()).map((p) => p.slug));
  const chosen = [...new Set(form.getAll("platform").filter((v): v is string => typeof v === "string" && known.has(v)))];

  const col = await subscribers();
  if (chosen.length === 0) {
    await col.deleteOne({ _id: subscriber._id });
    redirect("/newsletter/manage?left=1");
  }
  // Ticking every platform also covers ones added later.
  const allPlatforms = chosen.length === known.size;
  await col.updateOne({ _id: subscriber._id }, { $set: { platforms: chosen, allPlatforms, expiresAt: null, updatedAt: new Date() } });
  return { ok: true, message: `Saved. You follow ${chosen.length} ${chosen.length === 1 ? "platform" : "platforms"}.` };
}

export async function unsubscribeAll(token: string): Promise<LinkState> {
  const subscriber = await subscriberFor(token);
  if (subscriber) await (await subscribers()).deleteOne({ _id: subscriber._id });
  redirect("/newsletter/manage?left=1");
}
