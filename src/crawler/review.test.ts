import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { redirectedHome, sameWording } from "./check.ts";
import { decodeCloudflareEmail, extractDocument } from "./extract.ts";
import { isPublicAddress } from "./fetch.ts";
import { groupChanges } from "./newsletter.ts";
import { afterLogin } from "../lib/session-cookie.ts";
import { describeStats } from "../lib/format.ts";

const encode = (email: string, key: number) =>
  key.toString(16).padStart(2, "0") + [...email].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0")).join("");

test("Cloudflare-obfuscated addresses read the same on every load", () => {
  assert.equal(decodeCloudflareEmail(encode("legal@example.com", 0x5a)), "legal@example.com");
  assert.equal(decodeCloudflareEmail("zz"), null);
  const page = (key: number) =>
    `<main><p>${"Terms text. ".repeat(60)}</p><p>Write to <a href="/cdn-cgi/l/email-protection#${encode("legal@example.com", key)}"><span data-cfemail="${encode("legal@example.com", key)}">[email protected]</span></a>.</p></main>`;
  const a = extractDocument(page(0x11), { selectors: ["main"] }).content;
  assert.equal(a, extractDocument(page(0x7c), { selectors: ["main"] }).content);
  assert.match(a, /legal@example\.com/);
});

test("link addresses alone don't count as a change in wording", () => {
  assert.ok(sameWording("See [our policy](https://x.example/a?t=1).", "See [our policy](https://x.example/a?t=2)."));
  assert.ok(!sameWording("Fees are 5%.", "Fees are 7%."));
});

test("a terms page redirecting to the home page is caught", () => {
  assert.ok(redirectedHome("https://x.example/terms", "https://x.example/"));
  assert.ok(!redirectedHome("https://x.example/terms", "https://x.example/legal/terms"));
});

test("IPv4-compatible, 6to4 and site-local IPv6 addresses are not public", () => {
  for (const ip of ["::127.0.0.1", "2002:7f00:1::1", "fec0::1", "::ffff:7f00:1", "192.88.99.1"]) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ["8.8.8.8", "2606:4700::1111"]) assert.equal(isPublicAddress(ip), true, ip);
});

test("digest leaves out changes where no wording changed", () => {
  const platforms = [{ slug: "p", name: "P", kind: "", website: "https://p.example", documents: [{ slug: "d", title: "D", audience: "providers" as const, url: null, mode: "manual" as const, selectors: [] }] }];
  const at = new Date("2026-10-10T00:00:00Z");
  const row = (stats: { added: number; removed: number; changed: number }) => ({ _id: new ObjectId(), platform: "p", document: "d", capturedAt: at, stats });
  const groups = groupChanges(["p"], [row({ added: 0, removed: 0, changed: 0 }), row({ added: 1, removed: 0, changed: 0 })], platforms, new Map(), new Date(0));
  assert.equal(groups[0].changes.length, 1);
});

test("sign-in only returns to admin pages", () => {
  assert.equal(afterLogin("/admin/platforms/headway?from=abc"), "/admin/platforms/headway?from=abc");
  for (const bad of ["https://evil.example", "//evil.example", "/admin//evil", "/about", "/admin/login", null]) assert.equal(afterLogin(bad), "/admin");
});

test("stats always name what was added or removed", () => {
  assert.equal(describeStats({ added: 1, removed: 0, changed: 0 }), "1 paragraph added");
  assert.equal(describeStats({ added: 2, removed: 1, changed: 3 }), "3 paragraphs edited, 2 added, 1 removed");
});

test("typography changes alone are not a change in wording", async () => {
  const { diffDocuments, summarize } = await import("../core/diff.ts");
  const plain = "The \"Provider\" agrees -- it's binding -- to the terms...\n\nSecond clause.";
  const curly = "The “Provider” agrees — it’s binding — to the terms…\n\nSecond clause.";
  assert.deepEqual(summarize(diffDocuments(plain, curly)), { added: 0, removed: 0, changed: 0 });
  assert.deepEqual(summarize(diffDocuments(plain, curly.replace("Second", "Third"))), { added: 0, removed: 0, changed: 1 });
  assert.ok(sameWording(plain, curly));
});

test("inserting a list item doesn't renumber the rest into edits", async () => {
  const { diffDocuments, summarize } = await import("../core/diff.ts");
  assert.deepEqual(summarize(diffDocuments("1. a\n2. b\n3. c", "1. z\n2. a\n3. b\n4. c")), { added: 1, removed: 0, changed: 0 });
});

test("an edited paragraph next to a new one reads as one edit and one addition", async () => {
  const { diffDocuments } = await import("../core/diff.ts");
  const kinds = diffDocuments("Intro\n\nAlpha text here one\n\nBeta text here two\n\nOutro", "Intro\n\nBeta text here two changed\n\nGamma brand new\n\nOutro").map((e) => e.kind);
  assert.deepEqual(kinds, ["same", "removed", "changed", "added", "same"]);
});

test("inline markdown stripping handles parentheses in links and stray asterisks", async () => {
  const { stripInline, toBlocks, normalizeMarkdown } = await import("../core/text.ts");
  assert.equal(stripInline("[link](https://en.wikipedia.org/wiki/Foo_(bar)) now"), "link now");
  assert.equal(stripInline("a 2**3 power"), "a 2**3 power");
  assert.equal(stripInline("**bold** x"), "bold x");
  assert.deepEqual(toBlocks("> Quoted\n> line"), ["Quoted line"]);
  assert.equal(normalizeMarkdown("co­operate a‎b c"), "cooperate ab c");
});

test("pages are decoded in their own character set", async () => {
  const { decodeBody } = await import("./fetch.ts");
  const bytes = Buffer.from("Privacy \x96 caf\xe9", "latin1");
  assert.equal(decodeBody(bytes, "text/html; charset=windows-1252"), "Privacy – café");
  assert.equal(decodeBody(Buffer.concat([Buffer.from('<html><head><meta charset="windows-1252">'), bytes]), "text/html"), '<html><head><meta charset="windows-1252">Privacy – café');
  assert.equal(decodeBody(Buffer.from("café", "utf8"), "text/html"), "café");
});

test("hidden text is left out of the record", () => {
  const filler = "<p>" + "Terms text. ".repeat(60) + "</p>";
  const html = `<main>${filler}<p style="display:none">SECRET</p><span class="sr-only">SKIP</span><table><tr><td>Monthly<br>fee</td></tr></table></main>`;
  const content = extractDocument(html, { selectors: ["main"] }).content;
  assert.ok(!content.includes("SECRET") && !content.includes("SKIP"));
  assert.ok(content.includes("Monthly fee"));
});

test("lists and paragraphs inside a table cell keep their words apart", () => {
  const filler = "<p>" + "Terms text. ".repeat(60) + "</p>";
  const cell = "<ul><li>Providing <b>services</b></li><li>Analytics <ul><li>Ads</li><li>Reports</li></ul></li><li>Security</li></ul>";
  const html = `<main>${filler}<table><tr><th>Uses</th><td>${cell}</td><td><p>First.</p><p>Second</p></td></tr></table></main>`;
  const content = extractDocument(html, { selectors: ["main"] }).content;
  assert.ok(content.includes("Providing **services**; Analytics Ads; Reports; Security"), content);
  assert.ok(content.includes("First. Second"), content);
});

test("sign-in never returns to the sign-in page itself", () => {
  assert.equal(afterLogin("/admin/login?next=%2Fadmin"), "/admin");
});

test("a heading's level and a list's style are formatting, not wording", () => {
  assert.ok(sameWording("# Terms\n\n1. You agree.\n2. We may change fees.", "## Terms\n\n- You agree.\n- We may change fees."));
  assert.ok(!sameWording("## Terms\n\n- You agree.", "## Terms\n\n- You do not agree."));
});
