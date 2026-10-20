/**
 * Normalise extracted Markdown so that cosmetic noise (whitespace, invisible
 * characters, line endings) never shows up as a "change" to a document.
 */
export function normalizeMarkdown(markdown: string): string {
  return (
    markdown
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      // Every kind of space (no-break, thin, hair, ideographic…) becomes a plain one.
      .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, " ")
      // Invisible characters: zero-width spaces and joiners, soft hyphens, direction marks, BOM.
      .replace(/[\u00ad\u061c\u200b-\u200f\u2060-\u2064\u2066-\u206f\ufeff]/g, "")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * The same text whatever the typography: curly or straight quotes, any dash,
 * an ellipsis or three dots. Used only for comparing, never for what is
 * stored or shown, so a site switching to "smart quotes" is not a change
 * to its terms.
 */
export function foldTypography(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[ \t]{2,}/g, " ");
}

/**
 * What two blocks are compared by. Besides typography, formatting is
 * ignored: a heading's level, and whether a list item is numbered or
 * bulleted (or renumbered), so inserting one item doesn't turn every item
 * after it into an "edit".
 */
export function compareKey(block: string): string {
  return (
    foldTypography(block)
      // A heading moved up or down a level is still the same heading.
      .replace(/^#{1,6}(\s+)/, "#$1")
      // Bullets and numbers mark list items alike; renumbering or switching between them is formatting.
      .replace(/^(\s*)(?:[-*+]|\d+[.)])(\s+)/, "$1-$2")
  );
}

/** Remove inline Markdown (links, emphasis, escapes) and keep the readable text. */
export function stripInline(text: string): string {
  return text
    // Addresses may contain one level of parentheses, as Wikipedia's do.
    .replace(/!\[([^\]]*)\]\((?:[^()\s]|\([^()\s]*\))*\)/g, "$1") // images -> alt text
    .replace(/\[([^\]]*)\]\((?:[^()\s]|\([^()\s]*\))*\)/g, "$1") // links -> link text
    .replace(/\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g, "$1") // **bold**
    .replace(/__(?=\S)([\s\S]+?)(?<=\S)__/g, "$1") // __bold__
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
    // Quoted passages read as their text; the ">" is layout.
    const lines = chunk
      .split("\n")
      .map((l) => l.replace(/^\s*(?:>\s?)+/, ""))
      .filter((l) => l.trim() !== "");
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
