import { diffArrays, diffWordsWithSpace } from "diff";
import type { ChangeStats } from "./records.ts";
import { compareKey, foldTypography, toBlocks } from "./text.ts";

export interface WordPart {
  value: string;
  added: boolean;
  removed: boolean;
}

export type DiffEntry =
  | { kind: "same"; block: string }
  | { kind: "added"; block: string }
  | { kind: "removed"; block: string }
  | { kind: "changed"; before: string; after: string; parts: WordPart[] };

/** Share of characters two blocks have in common, from 0 to 1. */
function similarity(parts: WordPart[], a: string, b: string): number {
  const common = parts
    .filter((p) => !p.added && !p.removed)
    .reduce((n, p) => n + p.value.trim().length, 0);
  return common / Math.max(a.length, b.length, 1);
}

/** Words that differ only in typography count as the same word. */
const sameWord = (a: string, b: string) => foldTypography(a) === foldTypography(b);
const sameBlock = (a: string, b: string) => compareKey(a) === compareKey(b);

function wordDiff(before: string, after: string): WordPart[] {
  // The word differ honours `comparator` (diff 9 base.js) but its options type omits it.
  return diffWordsWithSpace(before, after, { comparator: sameWord } as Parameters<typeof diffWordsWithSpace>[2]).map((c) => ({
    value: c.value,
    added: Boolean(c.added),
    removed: Boolean(c.removed),
  }));
}

/**
 * Compare two documents paragraph by paragraph. A removed paragraph followed
 * by an added one that is mostly the same text becomes a single "changed"
 * entry with word-level detail, the way a legal redline reads.
 */
export function diffDocuments(beforeMarkdown: string, afterMarkdown: string): DiffEntry[] {
  const changes = diffArrays(toBlocks(beforeMarkdown), toBlocks(afterMarkdown), { comparator: sameBlock });
  const entries: DiffEntry[] = [];

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    if (!change.added && !change.removed) {
      for (const block of change.value) entries.push({ kind: "same", block });
      continue;
    }

    const removed = change.removed ? change.value : [];
    const next = changes[i + 1];
    const added = change.added ? change.value : next?.added ? next.value : [];
    if (change.removed && next?.added) i++;

    for (const entry of pairBlocks(removed, added)) entries.push(entry);
  }
  return entries;
}

const MIN_SIMILARITY = 0.4;
/** Above this many comparisons in one hunk, fall back to pairing by position. */
const MAX_PAIRING = 400;

/**
 * Match removed paragraphs with the added ones they most resemble, so an edit
 * next to an insertion reads as one edit and one insertion, not two removals
 * and two additions. Unmatched paragraphs are plain removals and additions.
 */
function pairBlocks(removed: string[], added: string[]): DiffEntry[] {
  const out: DiffEntry[] = [];
  if (removed.length * added.length > MAX_PAIRING) {
    for (let j = 0; j < Math.max(removed.length, added.length); j++) {
      const before = removed[j];
      const after = added[j];
      if (before !== undefined && after !== undefined) {
        const parts = wordDiff(before, after);
        if (similarity(parts, before, after) >= MIN_SIMILARITY) {
          out.push({ kind: "changed", before, after, parts });
          continue;
        }
      }
      if (before !== undefined) out.push({ kind: "removed", block: before });
      if (after !== undefined) out.push({ kind: "added", block: after });
    }
    return out;
  }

  const scored: { i: number; j: number; score: number; parts: WordPart[] }[] = [];
  removed.forEach((before, i) =>
    added.forEach((after, j) => {
      const parts = wordDiff(before, after);
      const score = similarity(parts, before, after);
      if (score >= MIN_SIMILARITY) scored.push({ i, j, score, parts });
    }),
  );
  scored.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);
  const matchFor = new Map<number, { j: number; parts: WordPart[] }>();
  const usedAdded = new Set<number>();
  for (const s of scored) {
    if (matchFor.has(s.i) || usedAdded.has(s.j)) continue;
    matchFor.set(s.i, { j: s.j, parts: s.parts });
    usedAdded.add(s.j);
  }

  // Keep reading order: additions come out just after the removal they precede.
  let nextAdded = 0;
  const flushAddedBefore = (limit: number) => {
    for (; nextAdded < limit; nextAdded++) {
      if (!usedAdded.has(nextAdded)) out.push({ kind: "added", block: added[nextAdded] });
    }
  };
  removed.forEach((before, i) => {
    const match = matchFor.get(i);
    if (match) {
      flushAddedBefore(match.j);
      out.push({ kind: "changed", before, after: added[match.j], parts: match.parts });
      nextAdded = Math.max(nextAdded, match.j + 1);
    } else {
      out.push({ kind: "removed", block: before });
    }
  });
  flushAddedBefore(added.length);
  return out;
}

export function summarize(entries: DiffEntry[]): ChangeStats {
  const stats: ChangeStats = { added: 0, removed: 0, changed: 0 };
  for (const e of entries) {
    if (e.kind === "added") stats.added++;
    else if (e.kind === "removed") stats.removed++;
    else if (e.kind === "changed") stats.changed++;
  }
  return stats;
}
