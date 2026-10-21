import { describeStats } from "../lib/format.ts";
import type { ChangeStats } from "./records.ts";

/*
 * The newsletter's emails, as plain text and simple HTML. Everything that
 * comes from outside (platform names, document titles, AI or editor
 * summaries) is escaped, so nothing in a summary can inject markup or links.
 */

export interface DigestChange {
  documentTitle: string;
  documentSlug: string;
  versionId: string;
  capturedAt: Date;
  datedOn: string | null;
  stats: ChangeStats | null;
  summary: { headline: string; points: string[]; reviewed: boolean; byAi: boolean } | null;
}

export interface DigestGroup {
  platformName: string;
  platformSlug: string;
  changes: DigestChange[];
}

export interface Composed {
  subject: string;
  text: string;
  html: string;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const day = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
const fmt = (d: Date) => day.format(d);

const INK = "#1d1b16";
const SOFT = "#5a564c";
const RULE = "#dcd8cc";
const LINK = "#17614a"; // the site's link green
const FONT = "Georgia, 'Times New Roman', serif";

function frame(title: string, body: string, footer: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#fbfaf6;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;font-family:${FONT};color:${INK};font-size:17px;line-height:1.55;">
<p style="margin:0 0 4px;font-size:26px;text-align:center;">Fine <i>Print</i></p>
<p style="margin:0 0 24px;font-size:14px;font-style:italic;color:${SOFT};text-align:center;border-bottom:3px double ${RULE};padding-bottom:16px;">The terms you practice under, kept on the record</p>
${body}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid ${RULE};font-size:13px;color:${SOFT};">${footer}</div>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${escape(href)}" style="display:inline-block;padding:10px 18px;background:${INK};color:#fbfaf6;text-decoration:none;font-variant:small-caps;letter-spacing:0.06em;">${escape(label)}</a></p>`;
}

/* ---------- Confirming a subscription ---------- */

/** `platformName` is null for a sign-up to every platform. */
export function confirmEmail(input: { platformName: string | null; confirmUrl: string; siteUrl: string }): Composed {
  const name = input.platformName;
  const subject = name ? `Confirm: weekly email about ${name}'s terms` : "Confirm: weekly email when platforms change their terms";
  const text = [
    `Someone, probably you, asked Fine Print to email this address when ${name ?? "any platform it tracks"} changes the terms it asks clinicians to accept.`,
    "",
    "You'll get one email on Mondays, and only in weeks when something changed.",
    "",
    `To confirm, open this link within 7 days and press "Confirm subscription":`,
    input.confirmUrl,
    "",
    "If you didn't ask for this, ignore this email. Nothing more will be sent.",
    "",
    `Fine Print · ${input.siteUrl}`,
  ].join("\n");
  const html = frame(
    subject,
    `<p>Someone, probably you, asked Fine Print to email this address when ${name ? `<b>${escape(name)}</b>` : "any platform it tracks"} changes the terms it asks clinicians to accept.</p>
<p>You&rsquo;ll get one email on Mondays, and only in weeks when something changed.</p>
${button(input.confirmUrl, "Confirm subscription")}
<p style="font-size:15px;color:${SOFT};">The button opens a page where you press &ldquo;Confirm subscription&rdquo; once more; that stops link scanners from signing you up. The link works for 7 days. If you didn&rsquo;t ask for this, ignore this email. Nothing more will be sent.</p>`,
    `<a href="${escape(input.siteUrl)}" style="color:${LINK};">Fine Print</a> keeps a public, dated record of healthcare platforms&rsquo; terms.`,
  );
  return { subject, text, html };
}

/* ---------- Receipt for a clinician's submission ---------- */

export function receiptEmail(input: { reference: string; siteUrl: string; contact: string | null }): Composed {
  const subject = `We received your submission ${input.reference}`;
  const write = input.contact ? `email ${input.contact}` : "reply to this email";
  const text = [
    `Thank you for sending Fine Print the terms you were shown. Your reference is ${input.reference}.`,
    "",
    "An editor will contact you to confirm it before anything is published, usually within a week. Your name and contact details are never published.",
    "",
    `To withdraw or add to your submission, ${write} and quote the reference. If you didn't send this, do the same and we'll delete it.`,
    "",
    `Fine Print · ${input.siteUrl}`,
  ].join("\n");
  const html = frame(
    subject,
    `<p>Thank you for sending Fine Print the terms you were shown.</p>
<p style="font-size:22px;letter-spacing:0.08em;margin:20px 0;"><b>${escape(input.reference)}</b></p>
<p>An editor will contact you to confirm it before anything is published, usually within a week. Your name and contact details are never published.</p>
<p style="font-size:15px;color:${SOFT};">To withdraw or add to your submission, ${escape(write)} and quote the reference. If you didn&rsquo;t send this, do the same and we&rsquo;ll delete it.</p>`,
    `<a href="${escape(input.siteUrl)}" style="color:${LINK};">Fine Print</a> keeps a public, dated record of healthcare platforms&rsquo; terms.`,
  );
  return { subject, text, html };
}

/* ---------- The weekly digest ---------- */

function summaryLabel(s: NonNullable<DigestChange["summary"]>): string {
  if (!s.byAi) return "Summary by a Fine Print editor";
  return s.reviewed
    ? "Summary written with AI and checked by a Fine Print editor"
    : "Summary written by AI, not yet checked by an editor";
}

function subjectFor(groups: DigestGroup[], days: number): string {
  const names = groups.map((g) => g.platformName);
  const list =
    names.length === 1
      ? names[0]
      : names.length <= 3
        ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
        : `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
  return `${list} changed ${names.length === 1 ? "its" : "their"} terms ${days > 8 ? "since your last email" : "this week"}`;
}

export function digestEmail(input: {
  groups: DigestGroup[];
  periodStart: Date;
  periodEnd: Date;
  siteUrl: string;
  manageUrl: string;
}): Composed {
  const { groups, siteUrl } = input;
  const subject = subjectFor(groups, (input.periodEnd.getTime() - input.periodStart.getTime()) / 86_400_000);
  const period = `${fmt(input.periodStart)} to ${fmt(input.periodEnd)}`;
  const count = groups.reduce((n, g) => n + g.changes.length, 0);
  const href = (g: DigestGroup, c: DigestChange) => `${siteUrl}/${g.platformSlug}/${c.documentSlug}/${c.versionId}`;

  const textParts: string[] = [
    `Fine Print: changes recorded ${period}`,
    "",
    `${count} ${count === 1 ? "change" : "changes"} to the terms of platforms you follow.`,
  ];
  const htmlParts: string[] = [
    `<p style="margin:0 0 8px;font-size:14px;color:${SOFT};font-variant:small-caps;letter-spacing:0.06em;">Changes recorded ${escape(period)}</p>`,
    `<h1 style="margin:0 0 24px;font-size:24px;font-weight:600;line-height:1.3;">${escape(subject)}</h1>`,
  ];

  for (const g of groups) {
    textParts.push("", g.platformName.toUpperCase(), "=".repeat(g.platformName.length));
    htmlParts.push(
      `<h2 style="margin:32px 0 8px;font-size:15px;font-variant:small-caps;letter-spacing:0.08em;color:${SOFT};border-bottom:1px solid ${RULE};padding-bottom:6px;">${escape(g.platformName)}</h2>`,
    );
    for (const c of g.changes) {
      // The date it reached the record; a hand capture can come after the change itself.
      const when = `Recorded ${fmt(c.capturedAt)}${c.datedOn ? ` (dated ${fmt(new Date(`${c.datedOn}T00:00:00Z`))})` : ""}`;
      const extent = describeStats(c.stats);
      textParts.push("", `${c.documentTitle}: ${when}. ${extent}.`);
      htmlParts.push(
        `<h3 style="margin:20px 0 2px;font-size:19px;font-weight:600;">${escape(c.documentTitle)}</h3>`,
        `<p style="margin:0 0 10px;font-size:14px;color:${SOFT};">${escape(when)} · ${escape(extent)}</p>`,
      );
      if (c.summary) {
        textParts.push(
          `${summaryLabel(c.summary)}. It may leave things out; the redline is the exact record.`,
          `  ${c.summary.headline}`,
          ...c.summary.points.map((p) => `  - ${p}`),
        );
        // Who wrote the summary comes first, before it's read as fact.
        htmlParts.push(
          `<div style="margin:0 0 10px;padding:12px 16px;background:#ffffff;border:1px solid ${RULE};border-left:3px solid ${INK};">`,
          `<p style="margin:0 0 6px;font-size:13px;font-style:italic;color:${SOFT};">${escape(summaryLabel(c.summary))}. It may leave things out; the redline is the exact record.</p>`,
          `<p style="margin:0 0 6px;font-weight:600;">${escape(c.summary.headline)}</p>`,
          c.summary.points.length
            ? `<ul style="margin:0;padding-left:20px;">${c.summary.points.map((p) => `<li style="margin:0 0 4px;">${escape(p)}</li>`).join("")}</ul>`
            : "",
          `</div>`,
        );
      } else {
        textParts.push("No summary yet; read the redline for the exact changes.");
        htmlParts.push(`<p style="margin:0 0 8px;font-size:15px;color:${SOFT};">No summary yet; the redline has the exact changes.</p>`);
      }
      textParts.push(`Redline: ${href(g, c)}`);
      htmlParts.push(
        `<p style="margin:0 0 8px;"><a href="${escape(href(g, c))}" style="color:${LINK};">See exactly what changed in the ${escape(c.documentTitle)}</a></p>`,
      );
    }
    // The whole picture: every change this company has made, as a timeline and a PDF.
    const record = `${siteUrl}/${g.platformSlug}`;
    textParts.push("", `${g.platformName}'s full record (timeline and PDF): ${record}`);
    htmlParts.push(
      `<p style="margin:16px 0 0;font-size:15px;"><a href="${escape(record)}" style="color:${LINK};">${escape(g.platformName)}&rsquo;s full record: every change, as a timeline and a PDF</a></p>`,
    );
  }

  const why = "You're getting this because you subscribed to weekly emails about these platforms on Fine Print. Weeks with no changes send nothing. Fine Print is not legal advice.";
  textParts.push("", "--", why, `Change platforms or unsubscribe: ${input.manageUrl}`, siteUrl);
  const html = frame(
    subject,
    htmlParts.join("\n"),
    `${escape(why)}<br><a href="${escape(input.manageUrl)}" style="color:${LINK};">Change platforms or unsubscribe</a> · <a href="${escape(siteUrl)}" style="color:${LINK};">Fine Print</a>`,
  );
  return { subject, text: textParts.join("\n"), html };
}
