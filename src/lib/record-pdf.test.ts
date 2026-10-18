import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import type { Platform } from "../core/platforms.ts";
import type { VersionSummary } from "./data.ts";
import { printable, recordPdf } from "./record-pdf.ts";
import { buildTimeline, standingOf } from "./timeline.ts";

const platform: Platform = {
  slug: "acme",
  name: "Acme Health",
  kind: "Electronic health records (EHR)",
  website: "https://acme.example",
  documents: [
    { slug: "terms", title: "Terms of Service", audience: "providers", url: "https://acme.example/terms", mode: "auto", selectors: ["main"] },
    { slug: "privacy", title: "Privacy Policy", audience: "everyone", url: null, mode: "manual", manualReason: "Blocked", selectors: ["main"] },
  ],
};

let n = 0;
const v = (over: Partial<VersionSummary>): VersionSummary => ({
  id: (++n).toString(16).padStart(24, "0"),
  platform: "acme",
  document: "terms",
  capturedAt: "2026-01-01T12:00:00.000Z",
  lastSeenAt: "2026-01-01T12:00:00.000Z",
  method: "auto",
  stats: { added: 1, removed: 0, changed: 2 },
  isFirst: false,
  summary: null,
  datedOn: null,
  ...over,
});

const history: VersionSummary[] = [
  v({
    capturedAt: "2026-10-18T08:00:00.000Z",
    summary: {
      headline: "Acme can now use providers’ names, photos and voice recordings in a “perpetual, irrevocable” license → for marketing.",
      points: ["Section 7.1 grants a perpetual license where it was limited before.", "Notice of fee changes drops from 30 days to 7.", "Disputes now go to binding arbitration."],
      reviewed: false,
      byAi: true,
    },
  }),
  v({ document: "privacy", capturedAt: "2026-10-10T08:00:00.000Z", method: "submission", datedOn: "2026-09-01", summary: { headline: "Data may be shared with partners.", points: [], reviewed: true, byAi: true } }),
  ...Array.from({ length: 14 }, (_, i) => v({ capturedAt: `2025-${String(12 - (i % 12)).padStart(2, "0")}-0${(i % 8) + 1}T08:00:00.000Z` })),
  v({ capturedAt: "2024-06-01T08:00:00.000Z", isFirst: true, stats: null }),
];

test("characters the font lacks are swapped, not shown as boxes", () => {
  assert.equal(printable("fees → up ≥ 5% — “quoted” café"), "fees -> up >= 5% — “quoted” café");
  assert.equal(printable("Łódź"), "?ódz", "accents the font has stay; others lose their accent or become ?");
});

test("the record PDF is a multi-page PDF with the company's details", async () => {
  const timeline = buildTimeline(platform, history);
  const pdf = await recordPdf({
    platform,
    standing: standingOf(platform, timeline, new Date("2026-10-19T00:00:00.000Z")),
    timeline,
    siteUrl: "https://fineprint.example",
    generatedAt: new Date("2026-10-19T00:00:00.000Z"),
  });
  if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, pdf);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const raw = pdf.toString("latin1");
  assert.match(raw, /\/DisplayDocTitle true/, "viewers show the title, not the file name");
  assert.ok((raw.match(/\/Type \/Page\b/g) ?? []).length >= 2, "the timeline runs over more than one page");
  assert.match(raw, /\/URI \(https:\/\/fineprint\.example\/acme\/terms\/0+1\)/, "changes link to their redlines");
});

test("entries never split across pages, unless one is taller than a page", async () => {
  const words = "the provider grants the company a perpetual irrevocable license to use their name likeness and recordings".split(" ");
  const sentence = (n: number, seed: number) => Array.from({ length: n }, (_, i) => words[(seed * 7 + i * 3) % words.length]).join(" ") + ".";
  const many: VersionSummary[] = Array.from({ length: 60 }, (_, i) =>
    v({
      id: `${(1000 + i).toString(16).padStart(24, "0")}`,
      capturedAt: new Date(Date.UTC(2026, 9, 18) - i * 86_400_000 * 9).toISOString(),
      summary:
        i % 5 === 4
          ? null
          : { headline: sentence(8 + (i % 4) * 9, i), points: Array.from({ length: i % 7 }, (_, k) => sentence(6 + ((i + k) % 5) * 8, i + k)), reviewed: i % 2 === 0, byAi: true },
    }),
  );
  const giant = v({
    id: "f".repeat(24),
    capturedAt: "2023-01-01T00:00:00.000Z",
    summary: { headline: sentence(30, 1), points: Array.from({ length: 40 }, (_, k) => sentence(40, k)), reviewed: true, byAi: true },
  });
  const timeline = buildTimeline(platform, [...many, giant]);
  const pages: { id: string; firstPage: number; lastPage: number }[] = [];
  const pdf = await recordPdf({
    platform,
    standing: standingOf(platform, timeline, new Date("2026-10-19T00:00:00.000Z")),
    timeline,
    siteUrl: "https://fineprint.syedsannan.com",
    generatedAt: new Date("2026-10-19T00:00:00.000Z"),
    report: (e) => pages.push(e),
  });
  if (process.env.PDF_STRESS_OUT) writeFileSync(process.env.PDF_STRESS_OUT, pdf);
  assert.equal(pages.length, timeline.length);
  const split = pages.filter((p) => p.firstPage !== p.lastPage).map((p) => p.id);
  assert.deepEqual(split, ["f".repeat(24)], "only the entry taller than a page runs over");
});
