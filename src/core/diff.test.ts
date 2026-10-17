import assert from "node:assert/strict";
import { test } from "node:test";
import { diffDocuments, summarize } from "./diff.ts";
import { normalizeMarkdown, stripInline, toBlocks } from "./text.ts";

test("normalisation ignores invisible and whitespace noise", () => {
  const a = normalizeMarkdown("Hello world  \r\n\r\n\r\n​Next");
  assert.equal(a, "Hello world\n\nNext");
});

test("inline markup is stripped but text is kept", () => {
  assert.equal(stripInline("See **our** [Privacy Policy](https://x.test/p) \\- _now_"), "See our Privacy Policy - now");
  assert.equal(stripInline("snake_case_word stays"), "snake_case_word stays");
});

test("empty headings are dropped", () => {
  assert.deepEqual(toBlocks("# Title\n\n#####\n\nBody"), ["# Title", "Body"]);
});

test("lists and headings become separate blocks", () => {
  assert.deepEqual(toBlocks("## Fees\n\nIntro line\n- one\n- two"), ["## Fees", "Intro line", "- one", "- two"]);
});

test("an edited paragraph is reported as changed with word detail", () => {
  const before = "## License\n\nYou grant us a limited license to use your name.";
  const after = "## License\n\nYou grant us a perpetual, irrevocable license to use your name and voice.";
  const entries = diffDocuments(before, after);
  assert.equal(entries[0].kind, "same");
  const changed = entries[1];
  assert.equal(changed.kind, "changed");
  if (changed.kind !== "changed") return;
  assert.ok(changed.parts.some((p) => p.removed && p.value.includes("limited")));
  assert.ok(changed.parts.some((p) => p.added && p.value.includes("irrevocable")));
  assert.deepEqual(summarize(entries), { added: 0, removed: 0, changed: 1 });
});

test("unrelated paragraphs are reported as removed and added", () => {
  const entries = diffDocuments("Alpha beta gamma.", "Completely different sentence here.");
  assert.deepEqual(summarize(entries), { added: 1, removed: 1, changed: 0 });
});

test("identical documents have no changes", () => {
  assert.deepEqual(summarize(diffDocuments("A\n\nB", "A\n\nB")), { added: 0, removed: 0, changed: 0 });
});
