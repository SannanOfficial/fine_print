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
