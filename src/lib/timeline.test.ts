import assert from "node:assert/strict";
import { test } from "node:test";
import type { Platform } from "../core/platforms.ts";
import type { VersionSummary } from "./data.ts";
import { buildTimeline, byYear, standingOf } from "./timeline.ts";

const platform: Platform = {
  slug: "acme",
  name: "Acme",
  kind: "EHR",
  website: "https://acme.example",
  documents: [
    { slug: "terms", title: "Terms of Service", audience: "providers", url: null, mode: "auto", selectors: ["main"] },
    { slug: "privacy", title: "Privacy Policy", audience: "everyone", url: null, mode: "auto", selectors: ["main"] },
  ],
};

const v = (over: Partial<VersionSummary>): VersionSummary => ({
  id: Math.random().toString(16).slice(2),
  platform: "acme",
  document: "terms",
  capturedAt: "2026-01-01T12:00:00.000Z",
  lastSeenAt: "2026-01-01T12:00:00.000Z",
  method: "auto",
  stats: { added: 1, removed: 0, changed: 0 },
  isFirst: false,
  summary: null,
  datedOn: null,
  ...over,
});

const history = [
  v({ capturedAt: "2026-10-18T08:00:00.000Z", summary: { headline: "Fees now change with 7 days' notice.", points: [], reviewed: false, byAi: true } }),
  v({ document: "privacy", capturedAt: "2026-10-10T08:00:00.000Z", method: "submission", datedOn: "2026-09-01", summary: { headline: "Data may be sold.", points: [], reviewed: true, byAi: true } }),
  v({ capturedAt: "2025-03-01T08:00:00.000Z" }),
  v({ capturedAt: "2024-06-01T08:00:00.000Z", isFirst: true, stats: null }),
  v({ document: "privacy", capturedAt: "2025-01-01T08:00:00.000Z", isFirst: true, stats: null }),
  v({ document: "no-longer-tracked", capturedAt: "2026-05-01T08:00:00.000Z" }),
];

test("the timeline covers every tracked document, newest first, by the date on the document when there is one", () => {
  const items = buildTimeline(platform, history);
  assert.equal(items.length, 5, "the untracked document is left out");
  assert.deepEqual(
    items.map((i) => [i.documentTitle, i.date.slice(0, 10)]),
    [
      ["Terms of Service", "2026-10-18"],
      ["Privacy Policy", "2026-09-01"],
      ["Terms of Service", "2025-03-01"],
      ["Privacy Policy", "2025-01-01"],
      ["Terms of Service", "2024-06-01"],
    ],
  );
  assert.equal(items[1].recordedAt, "2026-10-10T08:00:00.000Z", "a dated change also says when it was recorded");
  assert.equal(items[0].recordedAt, null);
  assert.deepEqual(byYear(items).map(([y, list]) => [y, list.length]), [["2026", 2], ["2025", 2], ["2024", 1]]);
});

test("the overview counts changes, not first copies", () => {
  const s = standingOf(platform, buildTimeline(platform, history), new Date("2026-10-19T00:00:00.000Z"));
  assert.equal(s.documents, 2);
  assert.equal(s.trackedSince?.slice(0, 10), "2024-06-01");
  assert.equal(s.changes, 3);
  assert.equal(s.lastChange?.slice(0, 10), "2026-10-18");
  assert.equal(s.changesInLastYear, 2);
  assert.equal(s.sharedPrivately, 1);
  assert.deepEqual(s.summaries, { reviewed: 1, aiDrafts: 1, none: 1 });
});

test("tracking began when the first copy was recorded, even if that copy carries an older date", () => {
  const items = buildTimeline(platform, [v({ capturedAt: "2026-10-01T08:00:00.000Z", isFirst: true, stats: null, datedOn: "2019-05-01" })]);
  assert.equal(items[0].date.slice(0, 10), "2019-05-01", "the entry shows the document's own date");
  assert.equal(standingOf(platform, items, new Date("2026-10-19T00:00:00.000Z")).trackedSince?.slice(0, 10), "2026-10-01");
});
