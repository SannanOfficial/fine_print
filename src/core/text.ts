/**
 * Normalise extracted Markdown so that cosmetic noise (whitespace, invisible
 * characters, line endings) never shows up as a "change" to a document.
 */
export function normalizeMarkdown(markdown: string): string {
  return markdown
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ") // non-breaking spaces
    .replace(/[​-‍⁠﻿]/g, "") // zero-width characters
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Remove inline Markdown (links, emphasis, escapes) and keep the readable text. */
export function stripInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images -> alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> link text
    .replace(/\*\*|__/g, "") // bold markers
    .replace(/(^|[^\w*])\*(?!\s)([^*]+?)\*(?=[^\w*]|$)/g, "$1$2") // *em*
    .replace(/(^|[^\w])_(?!\s)([^_]+?)_(?=[^\w]|$)/g, "$1$2") // _em_
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1") // Markdown escapes
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Split a document into readable blocks: one per paragraph, heading, list
 * item or table. Each block keeps a leading "#"/"-"/"1." marker so the
 * renderer knows its kind. Comparing documents block by block keeps diffs
 * readable even when a single paragraph is very long.
 */
export function toBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  for (const chunk of markdown.split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;

    if (lines.every((l) => l.trimStart().startsWith("|"))) {
      blocks.push(lines.map((l) => l.trim()).join("\n")); // keep tables whole
      continue;
    }

    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length) blocks.push(stripInline(paragraph.join(" ")));
      paragraph = [];
    };
    for (const line of lines) {
      if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line) || /^#{1,6}\s/.test(line)) {
        flush();
        blocks.push(stripInline(line.trim()));
      } else {
        paragraph.push(line.trim());
      }
    }
    flush();
  }
  // Drop empty headings or bullets (e.g. a bare "#####" left by an empty <h5>).
  return blocks.filter((b) => b !== "" && !/^(?:#{1,6}|[-*+])$/.test(b.trim()));
}

export type BlockKind = "heading" | "item" | "table" | "paragraph";

export function parseBlock(block: string): { kind: BlockKind; level: number; text: string } {
  const heading = /^(#{1,6})\s+(.*)$/s.exec(block);
  if (heading) return { kind: "heading", level: heading[1].length, text: heading[2] };
  const item = /^\s*(?:[-*+]|(\d+[.)]))\s+(.*)$/s.exec(block);
  if (item) return { kind: "item", level: 0, text: item[1] ? `${item[1]} ${item[2]}` : item[2] };
  if (block.startsWith("|")) return { kind: "table", level: 0, text: block };
  return { kind: "paragraph", level: 0, text: block };
}

/** Length of the marker that `parseBlock` strips from the start of a block. */
export function markerLength(block: string): number {
  const m = /^(#{1,6}\s+|\s*[-*+]\s+)/.exec(block);
  return m ? m[0].length : 0;
}
