import type { ReactNode } from "react";
import { parseBlock, toBlocks } from "@/core/text.ts";

/**
 * Render one block of a document. All text goes through React, which escapes
 * it, and links are shown as plain text, so nothing captured from a third
 * party site can inject markup or send readers elsewhere.
 */
export function Block({ block, children }: { block: string; children?: ReactNode }) {
  const { kind, level, text } = parseBlock(block);
  const content = children ?? text;
  switch (kind) {
    case "heading":
      return <p className={`doc-heading doc-h${Math.min(level, 4)}`}>{content}</p>;
    case "item":
      return <p className="doc-item">{content}</p>;
    case "table":
      return <pre className="doc-table">{content}</pre>;
    default:
      return <p className="doc-p">{content}</p>;
  }
}

export function DocumentText({ content }: { content: string }) {
  return (
    <div className="doc">
      {toBlocks(content).map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}
