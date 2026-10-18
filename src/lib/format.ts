import type { ChangeStats, CheckOutcome } from "@/core/records.ts";

const day = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const dayTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Oct 17, 2026". Dates are shown in UTC so everyone sees the same record. */
export const formatDay = (iso: string) => day.format(new Date(iso));

/** "Oct 17, 2026, 9:04 AM UTC" */
export const formatDayTime = (iso: string) => `${dayTime.format(new Date(iso))} UTC`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 paragraphs edited, 1 added" */
export function describeStats(stats: ChangeStats | null): string {
  if (!stats) return "First copy on record";
  const parts = [
    stats.changed && `${plural(stats.changed, "paragraph", "paragraphs")} edited`,
    stats.added && `${stats.changed ? stats.added : plural(stats.added, "paragraph", "paragraphs")} added`,
    stats.removed && `${stats.changed || stats.added ? stats.removed : plural(stats.removed, "paragraph", "paragraphs")} removed`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Formatting or links changed";
}

/** Plain-language result of the latest check, safe to show publicly. */
export function describeOutcome(outcome: CheckOutcome): { ok: boolean; text: string } {
  switch (outcome) {
    case "first-capture":
    case "changed":
    case "unchanged":
      return { ok: true, text: "Checked" };
    case "blocked":
      return { ok: false, text: "The site blocked our last check" };
    case "robots-disallowed":
      return { ok: false, text: "The site asked crawlers not to load this page" };
    case "extraction-failed":
      return { ok: false, text: "The page layout changed and our checker needs an update" };
    case "unstable":
      return { ok: false, text: "The page showed different text on two loads; we will check again" };
    case "fetch-failed":
      return { ok: false, text: "The site could not be reached on our last check" };
  }
}
