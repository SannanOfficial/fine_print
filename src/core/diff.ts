import { diffArrays, diffWordsWithSpace } from "diff";
import type { ChangeStats } from "./records.ts";
import { toBlocks } from "./text.ts";

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

function wordDiff(before: string, after: string): WordPart[] {
  return diffWordsWithSpace(before, after).map((c) => ({
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
  const changes = diffArrays(toBlocks(beforeMarkdown), toBlocks(afterMarkdown));
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

    const pairs = Math.max(removed.length, added.length);
    for (let j = 0; j < pairs; j++) {
      const before = removed[j];
      const after = added[j];
      if (before !== undefined && after !== undefined) {
        const parts = wordDiff(before, after);
        if (similarity(parts, before, after) >= 0.4) {
          entries.push({ kind: "changed", before, after, parts });
          continue;
        }
      }
      if (before !== undefined) entries.push({ kind: "removed", block: before });
      if (after !== undefined) entries.push({ kind: "added", block: after });
    }
  }
  return entries;
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
