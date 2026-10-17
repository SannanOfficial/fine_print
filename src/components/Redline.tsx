import type { DiffEntry, WordPart } from "@/core/diff.ts";
import { markerLength } from "@/core/text.ts";
import { Block } from "./DocumentText.tsx";

/** Unchanged paragraphs shown around each change for context. */
const CONTEXT = 1;

type Row = { type: "entry"; entry: DiffEntry } | { type: "gap"; count: number };

function withGaps(entries: DiffEntry[]): Row[] {
  const near = entries.map((_, i) =>
    entries.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).some((e) => e.kind !== "same"),
  );
  const rows: Row[] = [];
  entries.forEach((entry, i) => {
    if (entry.kind !== "same" || near[i]) {
      rows.push({ type: "entry", entry });
      return;
    }
    const last = rows[rows.length - 1];
    if (last?.type === "gap") last.count++;
    else rows.push({ type: "gap", count: 1 });
  });
  return rows;
}

/** Drop the first `count` characters of the new text (removed parts don't count). */
function dropLeading(parts: WordPart[], count: number): WordPart[] {
  const out: WordPart[] = [];
  let skip = count;
  for (const p of parts) {
    if (skip === 0 || p.removed) {
      out.push(p);
      continue;
    }
    const cut = Math.min(skip, p.value.length);
    skip -= cut;
    if (p.value.length > cut) out.push({ ...p, value: p.value.slice(cut) });
  }
  return out;
}

function ChangedBlock({ entry }: { entry: Extract<DiffEntry, { kind: "changed" }> }) {
  // Drop the heading/list marker (e.g. "## ") from the word diff; Block adds the styling.
  const parts = dropLeading(entry.parts, markerLength(entry.after));
  return (
    <Block block={entry.after}>
      {parts.map((p, i) =>
        p.added ? <ins key={i}>{p.value}</ins> : p.removed ? <del key={i}>{p.value}</del> : <span key={i}>{p.value}</span>,
      )}
    </Block>
  );
}

export function Redline({ entries }: { entries: DiffEntry[] }) {
  return (
    <div className="doc redline">
      {withGaps(entries).map((row, i) => {
        if (row.type === "gap") {
          return (
            <p key={i} className="redline-gap">
              {row.count} unchanged {row.count === 1 ? "paragraph" : "paragraphs"}
            </p>
          );
        }
        const { entry } = row;
        switch (entry.kind) {
          case "same":
            return <Block key={i} block={entry.block} />;
          case "changed":
            return <ChangedBlock key={i} entry={entry} />;
          case "added":
            return (
              <div key={i} className="redline-whole redline-added">
                <span className="redline-tag">Added</span>
                <ins>
                  <Block block={entry.block} />
                </ins>
              </div>
            );
          case "removed":
            return (
              <div key={i} className="redline-whole redline-removed">
                <span className="redline-tag">Removed</span>
                <del>
                  <Block block={entry.block} />
                </del>
              </div>
            );
        }
      })}
    </div>
  );
}

export function RedlineLegend() {
  return (
    <p className="legend">
      <del>Struck-through red</del> text was removed. <ins>Underlined blue</ins> text was added.
    </p>
  );
}
