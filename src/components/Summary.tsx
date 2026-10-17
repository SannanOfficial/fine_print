import type { ChangeSummary } from "@/lib/data.ts";

/** The plain-language summary shown above a redline. */
export function SummaryBox({ summary }: { summary: ChangeSummary }) {
  return (
    <aside className="summary" aria-labelledby="summary-title">
      <p className="summary-label" id="summary-title">
        In brief
      </p>
      <p className="summary-headline">{summary.headline}</p>
      {summary.points.length > 0 && (
        <ul className="summary-points">
          {summary.points.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ul>
      )}
      <p className="summary-note">
        {!summary.byAi
          ? "Summary written by a Fine Print editor."
          : summary.reviewed
            ? "Summary written with AI and checked by a Fine Print editor."
            : "Summary written automatically by AI and not yet checked by an editor."}{" "}
        It may leave things out. The redline below is the exact record.
      </p>
    </aside>
  );
}
