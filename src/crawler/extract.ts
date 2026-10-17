import { NodeHtmlMarkdown } from "node-html-markdown";
import { parse, type HTMLElement } from "node-html-parser";
import type { TrackedDocument } from "../core/platforms.ts";
import { normalizeMarkdown } from "../core/text.ts";

/** Elements that never carry terms text. */
const ALWAYS_REMOVE = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "svg",
  "canvas",
  "button",
  "form",
  "input",
  "select",
  "dialog",
  '[aria-hidden="true"]',
  "[hidden]",
];

/** Anything shorter than this is almost certainly a broken selector, not a document. */
export const MIN_DOCUMENT_CHARS = 500;

const markdown = new NodeHtmlMarkdown({
  bulletMarker: "-",
  keepDataImages: false,
  useLinkReferenceDefinitions: false,
  maxConsecutiveNewlines: 2,
});

export class ExtractionError extends Error {}

export interface Extracted {
  content: string;
  selector: string;
}

/**
 * Pull the document text out of a page as normalised Markdown. Parsing is
 * done by a plain HTML parser: nothing on the page is executed.
 */
export function extractDocument(html: string, doc: Pick<TrackedDocument, "selectors" | "remove">): Extracted {
  const root = parse(html, { comment: false });

  let container: HTMLElement | null = null;
  let used = "";
  for (const selector of doc.selectors) {
    container = root.querySelector(selector);
    if (container) {
      used = selector;
      break;
    }
  }
  if (!container) throw new ExtractionError(`None of the selectors matched: ${doc.selectors.join(", ")}`);

  for (const selector of [...ALWAYS_REMOVE, ...(doc.remove ?? [])]) {
    for (const node of container.querySelectorAll(selector)) node.remove();
  }

  const content = normalizeMarkdown(markdown.translate(container.innerHTML));
  if (content.length < MIN_DOCUMENT_CHARS) {
    throw new ExtractionError(`Extracted text is only ${content.length} characters (selector "${used}")`);
  }
  return { content, selector: used };
}
