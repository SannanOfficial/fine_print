import { NodeHtmlMarkdown } from "node-html-markdown";
import { HTMLElement, parse } from "node-html-parser";
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
  // Text hidden with inline styles or the usual screen-reader-only classes.
  '[style*="display:none"]',
  '[style*="display: none"]',
  '[style*="visibility:hidden"]',
  '[style*="visibility: hidden"]',
  ".sr-only",
  ".visually-hidden",
  ".screen-reader-text",
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

/**
 * Cloudflare's "email obfuscation" swaps addresses for a hex string XORed
 * with a random key that changes on every load, which would make the page
 * look different each time. Decode them back to plain addresses.
 */
export function decodeCloudflareEmail(hex: string): string | null {
  if (!/^(?:[0-9a-f]{2}){2,}$/i.test(hex)) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return /^[^\s@<>]+@[^\s@<>]+$/.test(out) ? out : null;
}

function restoreEmails(root: HTMLElement) {
  for (const node of root.querySelectorAll("[data-cfemail]")) {
    const email = decodeCloudflareEmail(node.getAttribute("data-cfemail") ?? "");
    if (email) node.replaceWith(email);
  }
  for (const link of root.querySelectorAll('a[href*="/cdn-cgi/l/email-protection"]')) {
    const email = decodeCloudflareEmail((link.getAttribute("href") ?? "").split("#")[1] ?? "");
    if (email) link.setAttribute("href", `mailto:${email}`);
    else link.removeAttribute("href");
  }
}

/**
 * A Markdown table cell holds one line, so line breaks, paragraphs and lists
 * inside a cell would otherwise glue their words together ("our
 * ServicesProviding customer service"). A list becomes its items separated
 * by semicolons. Innermost first, so a nested list is flattened before the
 * list around it.
 */
function separateCellContent(container: HTMLElement): void {
  for (const br of container.querySelectorAll("td br, th br")) br.replaceWith(" ");
  for (const list of container.querySelectorAll("td ul, td ol, th ul, th ol").reverse()) {
    const items = list.childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement && n.tagName === "LI");
    const joined = items
      .map((li, i) => {
        const html = li.innerHTML.trim();
        return i < items.length - 1 && !/[.;:,]$/.test(li.text.trim()) ? `${html};` : html;
      })
      .join(" ");
    list.replaceWith(` ${joined} `);
  }
  for (const block of container.querySelectorAll("td p, td div, th p, th div").reverse()) block.replaceWith(` ${block.innerHTML} `);
}

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
  restoreEmails(container);
  separateCellContent(container);

  const content = normalizeMarkdown(markdown.translate(container.innerHTML));
  if (content.length < MIN_DOCUMENT_CHARS) {
    throw new ExtractionError(`Extracted text is only ${content.length} characters (selector "${used}")`);
  }
  return { content, selector: used };
}
