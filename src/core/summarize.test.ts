import assert from "node:assert/strict";
import { test } from "node:test";
import { changeBrief } from "./summarize.ts";

test("brief lists only changed paragraphs, under their section", () => {
  const before = "# Terms\n\n## 7. License\n\nYou grant a limited, revocable license.\n\nUnchanged paragraph.";
  const after = "# Terms\n\n## 7. License\n\nYou grant a perpetual, irrevocable license.\n\nUnchanged paragraph.\n\nNew clause here.";
  const brief = changeBrief(before, after);
  assert.match(brief, /## Section: 7\. License/);
  assert.match(brief, /BEFORE: You grant a limited, revocable license\./);
  assert.match(brief, /AFTER: You grant a perpetual, irrevocable license\./);
  assert.match(brief, /ADDED: New clause here\./);
  assert.doesNotMatch(brief, /Unchanged paragraph/);
});

test("brief is empty when nothing changed", () => {
  assert.equal(changeBrief("Same text.", "Same text."), "");
});

test("brief stays under the size limit", () => {
  const after = Array.from({ length: 50 }, (_, i) => `Clause ${i} `.repeat(20)).join("\n\n");
  const brief = changeBrief("", after, 2_000);
  assert.ok(brief.length < 2_200);
  assert.match(brief, /further changed paragraphs were left out/);
});

test("summaries that name an address are caught", async () => {
  const { mentionsAddress } = await import("./summarize.ts");
  for (const bad of [
    "Clinicians should re-verify at platform-verify.example.",
    "Visit https://example.org/verify now.",
    "Send notices to legal@headway.co instead.",
    "See www.example.com.",
  ]) {
    assert.equal(mentionsAddress(bad), true, bad);
  }
  for (const fine of [
    "Headway can now change its fees with 7 days' notice, down from 30.",
    "The address for legal notices changed.",
    "Section 4.2 now grants a \"perpetual, irrevocable\" license.",
    "Fees rise to $1.50 per claim (e.g. for each visit).",
  ]) {
    assert.equal(mentionsAddress(fine), false, fine);
  }
});

test("a one-word change in a huge pasted paragraph sends just that stretch", () => {
  const words = Array.from({ length: 7000 }, (_, i) => `word${i}`).join(" ");
  const before = `${words} payment within thirty days ${words}`;
  const after = `${words} payment within seven days ${words}`;
  const brief = changeBrief(before, after);
  assert.match(brief, /BEFORE: \[…\] .*thirty days.* \[…\]/s);
  assert.match(brief, /AFTER: \[…\] .*seven days.* \[…\]/s);
  assert.ok(brief.length < 20_000, `brief is ${brief.length} characters`);
});
