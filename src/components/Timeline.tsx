import Link from "next/link";
import { describeStats, formatDay, formatDayTime } from "@/lib/format.ts";
import { byYear, METHOD_NOTE, summarySource, type Standing, type TimelineItem } from "@/lib/timeline.ts";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** A company's record at a glance: plain counts, no score. */
export function StandingPanel({ standing, name, pdfHref }: { standing: Standing; name: string; pdfHref: string }) {
  const s = standing;
  return (
    <section className="standing" aria-labelledby="standing-title">
      <h2 id="standing-title" className="standing-title">
        {name} on the record
      </h2>
      <dl className="standing-figures">
        <div>
          <dt>Changes recorded</dt>
          <dd>{s.changes.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>In the last 12 months</dt>
          <dd>{s.changesInLastYear.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Shared privately by clinicians</dt>
          <dd>{s.sharedPrivately.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Tracked since</dt>
          <dd className="is-date">{s.trackedSince ? formatDay(s.trackedSince) : "Not yet"}</dd>
        </div>
      </dl>
      <p className="standing-notes">
        {plural(s.documents, "document")} tracked
        {s.lastChange ? ` · last change ${formatDay(s.lastChange)}` : " · no changes recorded yet"}
        {s.changes > 0 &&
          ` · summaries: ${s.summaries.reviewed} checked by an editor, ${s.summaries.aiDrafts} AI ${s.summaries.aiDrafts === 1 ? "draft" : "drafts"}${
            s.summaries.none ? `, ${s.summaries.none} without one` : ""
          }`}
        .
        {s.sharedPrivately > 0 && " Changes shared privately were sent to clinicians but never appeared on a public page."}
      </p>
      <div className="standing-actions">
        <a href={pdfHref} className="button button-primary" download>
          Download the record (PDF)
        </a>
        <p>Every change with its date and summary, ready to save, print or share with your practice.</p>
      </div>
    </section>
  );
}

/** Every change to every document, newest first, grouped by year. */
export function RecordTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="record-timeline">
      {byYear(items).map(([year, list]) => (
        <section key={year} className="rt-year" aria-labelledby={`year-${year}`}>
          <h3 id={`year-${year}`} className="rt-year-label">
            {year}
          </h3>
          <ol className="rt-list">
            {list.map((item) => (
              <TimelineEntry key={item.id} item={item} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  const when = (
    <time className="rt-date" dateTime={item.date} title={item.recordedAt ? undefined : formatDayTime(item.date)}>
      {formatDay(item.date)}
    </time>
  );
  if (item.isStart) {
    return (
      <li className="rt-entry is-start">
        {when}
        <div className="rt-body">
          <p className="rt-start">
            Tracking began: the first copy of the <Link href={item.href}>{item.documentTitle}</Link> on the record,{" "}
            {METHOD_NOTE[item.method]}
            {item.recordedAt && ` (dated on the document; recorded ${formatDay(item.recordedAt)})`}.
          </p>
        </div>
      </li>
    );
  }
  const s = item.summary;
  const formattingOnly = item.stats !== null && item.stats.added + item.stats.removed + item.stats.changed === 0;
  return (
    <li className="rt-entry">
      {when}
      <div className="rt-body">
        <p className="rt-meta">
          <span className="rt-doc">{item.documentTitle}</span> · {describeStats(item.stats)} · {METHOD_NOTE[item.method]}
          {item.recordedAt && ` · dated on the document; recorded ${formatDay(item.recordedAt)}`}
        </p>
        {s ? (
          <>
            <p className={`rt-source${s.byAi && !s.reviewed ? " is-draft" : ""}`}>{summarySource(s)}</p>
            <p className="rt-headline">{s.headline}</p>
            {s.points.length > 0 && (
              <ul className="rt-points">
                {s.points.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="rt-none">
            {formattingOnly ? "Only links or formatting changed; the wording is the same." : "No summary for this change. The redline shows exactly what changed."}
          </p>
        )}
        <p className="rt-link">
          <Link href={item.href} prefetch={false}>
            See exactly what changed
          </Link>
        </p>
      </div>
    </li>
  );
}
