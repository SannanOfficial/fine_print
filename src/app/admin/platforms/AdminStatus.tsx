import type { AdminDocumentRow } from "@/lib/admin-data.ts";
import { describeOutcome, formatDay } from "@/lib/format.ts";

/** Where a document stands, for editors. Includes the crawler's own error text. */
export function AdminStatus({ row }: { row: AdminDocumentRow }) {
  const s = row.status;
  const outcome = s ? describeOutcome(s.lastOutcome) : null;
  const versions = `${row.versions} ${row.versions === 1 ? "version" : "versions"}`;
  if (!s) return <span className="status">{versions} · never checked</span>;
  return (
    <span className={`status ${outcome?.ok ? "status-ok" : "status-warn"}`} title={s.lastError ?? undefined}>
      {versions} · {outcome?.ok ? `checked ${formatDay(s.lastCheckedAt.toISOString())}` : outcome?.text}
      {s.consecutiveFailures > 1 && ` (${s.consecutiveFailures} times)`}
    </span>
  );
}
