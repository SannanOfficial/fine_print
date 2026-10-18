import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { audienceLabel, type Platform } from "../core/platforms.ts";
import { describeStats, formatDay, formatDayTime } from "./format.ts";
import { byYear, METHOD_NOTE, summarySource, type Standing, type TimelineItem } from "./timeline.ts";

/*
 * A company's record as a PDF: the overview, the documents tracked, and the
 * timeline of every change with its date and summary. Same content as the
 * platform page, laid out for printing and sharing. Text stays selectable
 * and searchable, and each change links to its redline.
 */

// The site's typeface. WOFF, not WOFF2: the PDF library can't subset the latter.
const FONT_DIR = path.join(process.cwd(), "node_modules/@fontsource/source-serif-4/files");
const FONTS = {
  regular: "source-serif-4-latin-400-normal.woff",
  bold: "source-serif-4-latin-600-normal.woff",
  italic: "source-serif-4-latin-400-italic.woff",
  boldItalic: "source-serif-4-latin-600-italic.woff",
} as const;
type FontName = keyof typeof FONTS;
let fontData: Record<FontName, Buffer> | null = null;
const fonts = () => (fontData ??= Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, readFileSync(path.join(FONT_DIR, f))])) as Record<FontName, Buffer>);

const INK = "#1d1b16";
const SOFT = "#5a564c";
const FAINT = "#736e63";
const RULE = "#dcd8cc";
const LINK = "#17614a";
const WARN = "#8a5a00";

/**
 * The font covers Latin text and common punctuation. Anything else (an
 * arrow in an AI summary, a rare accent) is swapped for a near equivalent,
 * so the PDF never shows empty boxes.
 */
const COVERED = /[\u0000-\u00ff\u0131\u0152\u0153\u02bb\u02bc\u02c6\u02da\u02dc\u2000-\u206f\u20ac\u2122\u2191\u2193\u2212\u2215]/;
const SWAPS: Record<string, string> = { "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "≠": "!=", "×": "x", "✓": "yes", "✔": "yes", "✗": "no", "−": "-" };
export function printable(text: string): string {
  let out = "";
  for (const ch of text) {
    if (COVERED.test(ch)) out += ch;
    else if (SWAPS[ch]) out += SWAPS[ch];
    else {
      const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
      out += [...base].every((c) => COVERED.test(c)) ? base : "?";
    }
  }
  return out;
}

export interface RecordPdfInput {
  platform: Platform;
  standing: Standing;
  timeline: TimelineItem[];
  siteUrl: string;
  generatedAt: Date;
  /** For tests: which pages each timeline entry was drawn on. */
  report?: (entry: { id: string; firstPage: number; lastPage: number }) => void;
}

export function recordPdf({ platform, standing, timeline, siteUrl, generatedAt, report }: RecordPdfInput): Promise<Buffer> {
  const pageUrl = `${siteUrl}/${platform.slug}`;
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 56, bottom: 72, left: 60, right: 60 },
    bufferPages: true,
    lang: "en-US",
    displayTitle: true,
    info: {
      Title: `${platform.name}: the record of its terms`,
      Author: "Fine Print",
      Subject: `Every recorded change to the terms ${platform.name} asks clinicians to accept, with dates and summaries.`,
      Keywords: `${platform.name}, terms of service, changes, Fine Print`,
      Creator: "Fine Print",
      CreationDate: generatedAt,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  for (const [name, data] of Object.entries(fonts())) doc.registerFont(name, data);
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (height: number) => {
    if (doc.y + height > bottom() && height < bottom() - doc.page.margins.top) doc.addPage();
  };
  const text = (font: FontName, size: number, color: string, value: string, options: PDFKit.Mixins.TextOptions = {}) =>
    doc.font(font).fontSize(size).fillColor(color).text(printable(value), options);
  const height = (font: FontName, size: number, value: string, w: number, options: PDFKit.Mixins.TextOptions = {}) =>
    doc.font(font).fontSize(size).heightOfString(printable(value), { width: w, ...options });
  const currentPage = () => {
    const range = doc.bufferedPageRange();
    return range.start + range.count - 1;
  };
  const smallCaps = (value: string) => value.toUpperCase();
  const rule = (double = false) => {
    const y = doc.y;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(double ? 0.6 : 0.5).strokeColor(double ? INK : RULE).stroke();
    if (double) doc.moveTo(left, y + 2.5).lineTo(left + width, y + 2.5).stroke();
    doc.y = y + (double ? 10 : 8);
  };
  const sectionHeading = (label: string) => {
    ensure(60);
    doc.moveDown(1.2);
    text("bold", 9.5, SOFT, smallCaps(label), { characterSpacing: 1.2 });
    doc.moveDown(0.3);
    rule();
  };

  // ----- Masthead and title -----
  doc.font("bold").fontSize(20).fillColor(INK).text("Fine ", left, doc.y, { continued: true });
  doc.font("italic").text("Print");
  text("italic", 9.5, SOFT, "The terms you practice under, kept on the record");
  doc.moveDown(0.6);
  rule(true);
  doc.moveDown(0.4);
  text("bold", 22, INK, `${platform.name}: the record of its terms`);
  doc.moveDown(0.2);
  text("regular", 10.5, SOFT, `${platform.kind} · ${new URL(platform.website).hostname}`);
  text("italic", 9.5, FAINT, `Generated ${formatDayTime(generatedAt.toISOString())} from `, { continued: true });
  doc.fillColor(LINK).text(pageUrl.replace(/^https?:\/\//, ""), { link: pageUrl, underline: false });

  // ----- On the record -----
  sectionHeading("On the record");
  const figures: [string, string][] = [
    ["Changes recorded", String(standing.changes)],
    ["In the last 12 months", String(standing.changesInLastYear)],
    ["Shared privately by clinicians", String(standing.sharedPrivately)],
    ["Tracked since", standing.trackedSince ? formatDay(standing.trackedSince) : "Not yet"],
  ];
  const col = width / figures.length;
  const top = doc.y;
  figures.forEach(([label, value], i) => {
    doc.font("bold").fontSize(i === 3 ? 13 : 20).fillColor(INK).text(value, left + i * col, top + (i === 3 ? 6 : 0), { width: col - 12 });
    doc.font("italic").fontSize(9).fillColor(SOFT).text(label, left + i * col, top + 27, { width: col - 12 });
  });
  doc.x = left;
  doc.y = top + 52;
  const s = standing;
  text(
    "regular",
    10,
    SOFT,
    [
      `${s.documents} ${s.documents === 1 ? "document" : "documents"} tracked.`,
      s.lastChange ? `Last change ${formatDay(s.lastChange)}.` : "No changes recorded yet.",
      s.changes > 0
        ? `Summaries: ${s.summaries.reviewed} checked by an editor, ${s.summaries.aiDrafts} AI ${s.summaries.aiDrafts === 1 ? "draft" : "drafts"} not yet checked${s.summaries.none ? `, ${s.summaries.none} without a summary` : ""}.`
        : "",
      s.sharedPrivately > 0 ? "Changes shared privately were sent to clinicians but never appeared on a public page." : "",
      `This record is not legal advice; always read the current agreement on ${platform.name}'s own site before you sign.`,
    ]
      .filter(Boolean)
      .join(" "),
    { width, lineGap: 2 },
  );

  // ----- Documents tracked -----
  sectionHeading("Documents tracked");
  for (const d of platform.documents) {
    ensure(34);
    text("bold", 11, INK, d.title, { width, continued: true });
    doc.font("regular").fillColor(SOFT).text(printable(`  ·  ${audienceLabel[d.audience]} · ${d.mode === "auto" ? "checked automatically twice a day" : "captured by hand"}`));
    if (d.url) doc.font("regular").fontSize(9).fillColor(LINK).text(d.url.replace(/^https:\/\//, ""), { link: d.url, width });
    doc.moveDown(0.4);
  }

  // ----- Timeline -----
  sectionHeading("Timeline of changes");
  text(
    "italic",
    9.5,
    SOFT,
    "Newest first. Each date is when the change happened as far as we know: the date on the document when it has one, otherwise the day Fine Print recorded it. Summaries may leave things out; each change links to its redline, the exact record.",
    { width, lineGap: 1.5 },
  );
  if (timeline.length === 0) {
    doc.moveDown(0.8);
    text("italic", 11, SOFT, `Nothing recorded for ${platform.name} yet.`);
  }

  const dateWidth = 92;
  const bodyX = left + dateWidth + 18;
  const bodyWidth = width - dateWidth - 18;
  for (const [year, items] of byYear(timeline)) {
    ensure(70);
    doc.moveDown(0.9);
    text("bold", 15, INK, year, { width });
    doc.moveDown(0.2);
    for (const item of items) {
      const link = `${siteUrl}${item.href}`;
      const linkLabel = item.isStart ? "Read this first copy: " : "See exactly what changed: ";
      const linkShown = link.replace(/^https?:\/\//, "");
      const summary = item.summary;
      const meta = `${item.documentTitle} · ${item.isStart ? "first copy on the record" : describeStats(item.stats)} · ${METHOD_NOTE[item.method]}${
        item.recordedAt ? ` · dated on the document; recorded ${formatDay(item.recordedAt)}` : ""
      }`;
      const noSummary =
        item.stats && item.stats.added + item.stats.removed + item.stats.changed === 0
          ? "Only links or formatting changed; the wording is the same."
          : "No summary for this change. The redline shows exactly what changed.";

      // Measure the entry exactly as it is drawn below, so it starts on a new page rather than splitting.
      const gap = (size: number, lines: number) => doc.font("regular").fontSize(size).currentLineHeight(true) * lines;
      const needed =
        8 +
        height("regular", 9.5, meta, bodyWidth) +
        (item.isStart
          ? 0
          : summary
            ? gap(9.5, 0.25) +
              height("bold", 8.5, smallCaps(summarySource(summary)), bodyWidth, { characterSpacing: 0.8 }) +
              gap(8.5, 0.1) +
              height("bold", 11.5, summary.headline, bodyWidth, { lineGap: 1 }) +
              summary.points.reduce((h, point) => h + gap(11.5, 0.15) + height("regular", 10.5, point, bodyWidth - 12, { lineGap: 1 }), 0)
            : gap(9.5, 0.2) + height("italic", 10.5, noSummary, bodyWidth)) +
        gap(10.5, 0.3) +
        height("regular", 9, linkLabel + linkShown, bodyWidth) +
        10;
      ensure(needed);

      const firstPage = currentPage();
      const entryTop = doc.y + 8;
      doc.moveTo(left, entryTop - 4).lineTo(left + width, entryTop - 4).lineWidth(0.5).strokeColor(RULE).stroke();
      doc.font("bold").fontSize(9.5).fillColor(INK).text(smallCaps(formatDay(item.date)), left, entryTop + 1, { width: dateWidth, characterSpacing: 0.6 });
      // The mark for this entry on the timeline's rule.
      doc.circle(bodyX - 10, entryTop + 5, 3.2).lineWidth(1.2).fillAndStroke("#ffffff", item.isStart ? FAINT : INK);
      // pdfkit keeps the x of the last call: everything below starts at the body column.
      doc.x = bodyX;
      doc.y = entryTop;
      text("regular", 9.5, SOFT, meta, { width: bodyWidth });
      if (item.isStart) {
        // Nothing more: tracking began here.
      } else if (summary) {
        doc.moveDown(0.25);
        text("bold", 8.5, summary.byAi && !summary.reviewed ? WARN : SOFT, smallCaps(summarySource(summary)), { width: bodyWidth, characterSpacing: 0.8 });
        doc.moveDown(0.1);
        text("bold", 11.5, INK, summary.headline, { width: bodyWidth, lineGap: 1 });
        for (const point of summary.points) {
          doc.moveDown(0.15);
          // A long point can run onto the next page; its bullet goes with its first line.
          if (doc.y + doc.font("regular").fontSize(10.5).currentLineHeight(true) > bottom()) doc.addPage();
          const y = doc.y;
          doc.font("regular").fontSize(10.5).fillColor(INK).text("•", bodyX, y, { width: 10 });
          doc.text(printable(point), bodyX + 12, y, { width: bodyWidth - 12, lineGap: 1 });
          doc.x = bodyX;
        }
      } else {
        doc.moveDown(0.2);
        text("italic", 10.5, SOFT, noSummary, { width: bodyWidth });
      }
      doc.moveDown(0.3);
      doc.font("regular").fontSize(9).fillColor(LINK).text(linkLabel, bodyX, doc.y, { continued: true, link, width: bodyWidth });
      doc.text(linkShown, { link });
      const entryBottom = doc.y + 6;
      const lastPage = currentPage();
      // The timeline's rule, below the mark, on every page the entry runs over.
      for (let page = firstPage; page <= lastPage; page++) {
        doc.switchToPage(page);
        const from = page === firstPage ? entryTop + 9 : doc.page.margins.top;
        const to = page === lastPage ? entryBottom : bottom();
        doc.moveTo(bodyX - 10, from).lineTo(bodyX - 10, to).lineWidth(1.2).strokeColor(RULE).stroke();
      }
      report?.({ id: item.id, firstPage, lastPage });
      doc.x = left;
      doc.y = entryBottom + 4;
    }
  }

  // ----- Footer on every page -----
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 46;
    // Writing inside the bottom margin must not start a new page.
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.moveTo(left, y - 8).lineTo(left + width, y - 8).lineWidth(0.5).strokeColor(RULE).stroke();
    doc
      .font("italic")
      .fontSize(8)
      .fillColor(FAINT)
      .text(printable(`Fine Print · ${pageUrl.replace(/^https?:\/\//, "")} · Not legal advice`), left, y, { width: width - 70, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, left + width - 70, y, { width: 70, align: "right", lineBreak: false });
    doc.page.margins.bottom = margin;
  }

  doc.end();
  return done;
}
