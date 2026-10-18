import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SHOWN_VIA } from "@/core/records.ts";
import { getSubmission, listPlatforms, STATUS_LABELS } from "@/lib/admin-data.ts";
import { requireAdmin } from "@/lib/auth.ts";
import { formatDayTime } from "@/lib/format.ts";
import { AdminBar } from "../../AdminBar.tsx";
import { DeleteSubmission, MarkContacted, SubmissionEditor } from "../../forms.tsx";
import { ChooseDocument } from "../../platforms/forms.tsx";

const kb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`);

export default function SubmissionPage({ params }: PageProps<"/admin/submissions/[id]">) {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      {params.then(({ id }) => (
        <Submission id={id} />
      ))}
    </Suspense>
  );
}

async function Submission({ id }: { id: string }) {
  const admin = await requireAdmin();
  let s: Awaited<ReturnType<typeof getSubmission>>;
  try {
    s = await getSubmission(id);
  } catch (error) {
    return (
      <>
        <AdminBar admin={admin} />
        <h1 className="admin-title">This submission can&rsquo;t be read</h1>
        <p className="note">
          Its encrypted details could not be decrypted ({(error as Error).message}). This happens when{" "}
          <code>FINEPRINT_DATA_KEY</code> has changed since it was received, or the record is damaged.
        </p>
      </>
    );
  }
  const platforms = await listPlatforms();
  if (!s) notFound();
  // The platform the sender named comes first.
  const documentOptions = [...platforms]
    .sort((a, b) => Number(b.slug === s.platformSlug) - Number(a.slug === s.platformSlug))
    .flatMap((p) => p.documents.map((d) => ({ value: `${p.slug}/${d.slug}`, label: `${p.name}: ${d.title}` })));
  const { details: d } = s;

  return (
    <>
      <AdminBar admin={admin} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/admin">All submissions</Link>
      </nav>
      <p className="eyebrow">
        {s.reference} · {STATUS_LABELS[s.status]}
      </p>
      <h1>
        {s.platform}: {d.documentName}
      </h1>

      <dl className="facts">
        <dt>Received by us</dt>
        <dd>{formatDayTime(s.receivedAt.toISOString())}</dd>
        <dt>Sender received it</dt>
        <dd>{d.receivedOn ?? "Not given"}</dd>
        <dt>Shown</dt>
        <dd>{SHOWN_VIA[d.shownVia]}</dd>
        {s.recordedAs && (
          <>
            <dt>Recorded as</dt>
            <dd>
              <Link href={s.recordedAs.href}>{s.recordedAs.href}</Link>
            </dd>
          </>
        )}
        {s.updatedBy && (
          <>
            <dt>Last updated</dt>
            <dd>
              {formatDayTime(s.updatedAt.toISOString())} by {s.updatedBy}
            </dd>
          </>
        )}
      </dl>

      <section className="section" aria-labelledby="contact-title">
        <div className="section-head">
          <h2 id="contact-title">Sender (private)</h2>
        </div>
        <dl className="facts">
          <dt>Name</dt>
          <dd>{d.contact.name}</dd>
          <dt>Profession</dt>
          <dd>{d.contact.profession || "Not given"}</dd>
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${encodeURIComponent(d.contact.email).replace(/%40/g, "@")}?subject=${encodeURIComponent(`Your Fine Print submission ${s.reference}`)}`}>
              {d.contact.email}
            </a>
            {d.contact.prefers === "phone" && <span className="status-warn"> · prefers a phone call</span>}
          </dd>
          <dt>Phone</dt>
          <dd>{d.contact.phone || "Not given"}</dd>
          <dt>Prefers</dt>
          <dd>{d.contact.prefers === "phone" ? "Phone" : "Email"}</dd>
        </dl>
        {s.status === "new" && <MarkContacted id={s.id} />}
      </section>

      <section className="section" aria-labelledby="text-title">
        <div className="section-head">
          <h2 id="text-title">What they sent</h2>
        </div>
        {d.text ? <pre className="sheet submitted-text">{d.text}</pre> : <p className="empty">No text pasted.</p>}
        {d.files.length > 0 && (
          <ul className="file-list">
            {d.files.map((f) => (
              <li key={f.id}>
                <a href={`/admin/submissions/${s.id}/files/${f.id}`} download>
                  {f.name}
                </a>{" "}
                <span className="method">
                  {f.type} · {kb(f.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="note">
          Files download rather than open in the browser. Open them with care: they came from a member of the public.
        </p>
      </section>

      <section className="section" aria-labelledby="review-title">
        <div className="section-head">
          <h2 id="review-title">Review</h2>
        </div>
        <SubmissionEditor id={s.id} status={s.status} notes={s.notes} />
      </section>

      <section className="section" aria-labelledby="publish-title">
        <div className="section-head">
          <h2 id="publish-title">Add to the record</h2>
        </div>
        <p className="note">
          Once you have confirmed it with the sender, record it as a version of a tracked document. The text they
          pasted is filled in for you to check. Their name and contact details are never published.
        </p>
        <ChooseDocument submissionId={s.id} options={documentOptions} />
      </section>

      <section className="section" aria-labelledby="delete-title">
        <div className="section-head">
          <h2 id="delete-title">Delete</h2>
        </div>
        <DeleteSubmission id={s.id} />
      </section>
    </>
  );
}
