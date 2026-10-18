import type { ChangeSummary } from "@/lib/data.ts";

/** The plain-language summary shown above a redline. */
export function SummaryBox({ summary }: { summary: ChangeSummary }) {
  return (
    <aside className="summary" aria-labelledby="summary-title">
      {/* Who wrote it comes first, before anyone reads it as fact. */}
      <p className="summary-label" id="summary-title">
        In brief{" "}
        <span className={`summary-source${summary.byAi && !summary.reviewed ? " is-draft" : ""}`}>
          ·{" "}
          {!summary.byAi
            ? "written by an editor"
            : summary.reviewed
              ? "AI summary, checked by an editor"
              : "AI draft, not yet checked by an editor"}
        </span>
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
        {summary.byAi ? "Drafted by an OpenAI GPT model from the changed paragraphs. " : ""}A summary may leave things out;
        the redline below is the exact record.
      </p>
    </aside>
  );
}
