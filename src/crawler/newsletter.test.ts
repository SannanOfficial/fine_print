import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { confirmEmail, digestEmail } from "../core/newsletter-email.ts";
import { confirmToken, EVERY_PLATFORM, manageToken, readToken } from "../core/newsletter-links.ts";
import type { Platform } from "../core/platforms.ts";
import { groupChanges, maskEmail, type ChangeRow } from "./newsletter.ts";

process.env.FINEPRINT_DATA_KEY ??= randomBytes(32).toString("base64");
const ID = "6ad3ba08f5cb02117f3166bc";

test("links: genuine ones read back, tampered or expired ones don't", () => {
  const manage = manageToken(ID, 1);
  assert.deepEqual(readToken(manage), { k: "manage", s: ID, v: 1 });

  const [body, mac] = manage.split(".");
  const forged = Buffer.from(JSON.stringify({ k: "manage", s: "6ad3ba08f5cb02117f3166bd", v: 1 })).toString("base64url");
  assert.equal(readToken(`${forged}.${mac}`), null, "body swapped");
  assert.equal(readToken(`${body}.${mac.slice(0, -2)}xx`), null, "signature altered");
  assert.equal(readToken("nonsense"), null);

  const now = Date.now();
  const confirm = confirmToken(ID, 1, "headway", now);
  assert.equal(readToken(confirm, now)?.k, "confirm");
  assert.equal(readToken(confirm, now + 8 * 86_400_000), null, "expired after 7 days");
});

test("sign-up for every platform: the link carries it, and the email names no single platform", () => {
  const link = readToken(confirmToken(ID, 1, EVERY_PLATFORM));
  assert.equal(link?.k === "confirm" ? link.p : null, EVERY_PLATFORM);
  const mail = confirmEmail({ platformName: null, confirmUrl: "https://x.example/c", siteUrl: "https://x.example" });
  assert.match(mail.text, /when any platform it tracks changes/);
  assert.doesNotMatch(`${mail.subject} ${mail.text} ${mail.html}`, /null|undefined/);
});

const platforms: Platform[] = [
  { slug: "headway", name: "Headway", kind: "x", website: "https://headway.co", documents: [{ slug: "terms", title: "Terms of Service", audience: "everyone", url: null, mode: "manual", manualReason: "x", selectors: ["main"] }] },
  { slug: "alma", name: "Alma <b>", kind: "x", website: "https://helloalma.com", documents: [{ slug: "provider", title: "Provider Terms", audience: "providers", url: null, mode: "manual", manualReason: "x", selectors: ["main"] }] },
];
const change = (platform: string, document: string, day: number): ChangeRow => ({
  _id: new ObjectId(),
  platform,
  document,
  capturedAt: new Date(Date.UTC(2026, 9, day)),
  stats: { added: 1, removed: 0, changed: 2 },
});

test("digest: only followed platforms, only since the last email, untracked documents left out", () => {
  const old = change("headway", "terms", 1);
  const fresh = change("headway", "terms", 12);
  const other = change("alma", "provider", 12);
  const gone = change("headway", "no-longer-tracked", 12);
  const since = new Date(Date.UTC(2026, 9, 5));
  const groups = groupChanges(["headway"], [old, fresh, other, gone], platforms, new Map(), since);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].changes.map((c) => c.versionId), [fresh._id.toHexString()]);
  assert.deepEqual(groupChanges(["headway"], [old], platforms, new Map(), since), [], "nothing new means nothing to send");
});

test("digest: hidden summaries are left out; labels say who wrote them", () => {
  const a = change("headway", "terms", 12);
  const b = change("alma", "provider", 13);
  const summaries = new Map([
    [a._id.toHexString(), { headline: "Fees now change with no notice.", points: ["Point"], state: "automatic" as const, model: "gpt" }],
    [b._id.toHexString(), { headline: "Hidden one", points: [], state: "hidden" as const, model: "gpt" }],
  ]);
  const groups = groupChanges(["headway", "alma"], [a, b], platforms, summaries, new Date(0));
  assert.equal(groups[0].changes[0].summary?.headline, "Fees now change with no notice.");
  assert.equal(groups[1].changes[0].summary, null);
  const mail = digestEmail({ groups, periodStart: new Date(0), periodEnd: new Date(), siteUrl: "https://fp.example", manageUrl: "https://fp.example/newsletter/manage?t=x" });
  assert.match(mail.text, /not yet checked by an editor/);
  assert.match(mail.subject, /Headway and Alma <b> changed their terms/);
});

test("digest email escapes everything that comes from outside", () => {
  const a = change("alma", "provider", 12);
  const summaries = new Map([[a._id.toHexString(), { headline: `<script>alert(1)</script>`, points: [`<a href="https://evil.example">click</a>`], state: "reviewed" as const, model: null }]]);
  const groups = groupChanges(["alma"], [a], platforms, summaries, new Date(0));
  const { html } = digestEmail({ groups, periodStart: new Date(0), periodEnd: new Date(), siteUrl: "https://fp.example", manageUrl: "https://fp.example/m" });
  assert.doesNotMatch(html, /<script>|<a href="https:\/\/evil/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Alma &lt;b&gt;/);
  assert.match(html, /Summary by a Fine Print editor/);
});

test("maskEmail", () => {
  assert.equal(maskEmail("someone@example.org"), "s******@example.org");
  assert.equal(maskEmail("a@b.co"), "a*@b.co");
});

test("only a refused recipient counts as a bounce; our own mail problems stop the run", async () => {
  const { ourProblem, recipientRefused } = await import("./newsletter.ts");
  const err = (code: string, command: string, responseCode?: number) => Object.assign(new Error("x"), { code, command, responseCode });
  // Wrong SMTP password: everyone would "bounce". It must stop the run instead.
  assert.equal(recipientRefused(err("EAUTH", "AUTH PLAIN", 535)), false);
  assert.equal(ourProblem(err("EAUTH", "AUTH PLAIN", 535)), true);
  // The provider refuses our sender address.
  assert.equal(recipientRefused(err("EENVELOPE", "MAIL FROM", 550)), false);
  assert.equal(ourProblem(err("EENVELOPE", "MAIL FROM", 550)), true);
  assert.equal(ourProblem(err("ECONNECTION", "CONN")), true);
  // The receiving server refuses this one address.
  assert.equal(recipientRefused(err("EENVELOPE", "RCPT TO", 550)), true);
  assert.equal(ourProblem(err("EENVELOPE", "RCPT TO", 550)), false);
  // A temporary refusal isn't a bounce.
  assert.equal(recipientRefused(err("EENVELOPE", "RCPT TO", 450)), false);
  // The message was rejected after the address was accepted: not the address's fault.
  assert.equal(recipientRefused(err("EMESSAGE", "DATA", 554)), false);
});
