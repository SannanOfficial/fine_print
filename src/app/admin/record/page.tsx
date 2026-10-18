import Link from "next/link";
import { Suspense } from "react";
import { getDocumentForEdit, listPlatforms } from "@/lib/admin-data.ts";
import { requireAdmin } from "@/lib/auth.ts";
import { formatDayTime } from "@/lib/format.ts";
import { AdminBar } from "../AdminBar.tsx";
import { ChooseDocument, RecordForm } from "../platforms/forms.tsx";

export const metadata = { title: "Add a record by hand" };

export default function AddRecord({ searchParams }: PageProps<"/admin/record">) {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      {searchParams.then((q) => (
        <AddRecordView
          doc={typeof q.doc === "string" ? q.doc : ""}
          recorded={typeof q.recorded === "string" && /^[a-f0-9]{24}$/.test(q.recorded) ? q.recorded : null}
        />
      ))}
    </Suspense>
  );
}

async function AddRecordView({ doc, recorded }: { doc: string; recorded: string | null }) {
  const admin = await requireAdmin();
  const platforms = await listPlatforms();
  const options = platforms.flatMap((p) => p.documents.map((d) => ({ value: `${p.slug}/${d.slug}`, label: `${p.name}: ${d.title}` })));
  const [platformSlug, documentSlug] = doc.split("/");
  const found = platformSlug && documentSlug ? await getDocumentForEdit(platformSlug, documentSlug) : null;
  const latest = found?.versions[0];

  return (
    <>
      <AdminBar admin={admin} />
      <h1 className="admin-title">Add a record by hand</h1>
      <p className="lede">
        For terms that came by email, in an app or as a contract, or from a page the crawler can&rsquo;t read. Paste the
        text, take it from a saved page, or fetch it, then check the redline before it goes on the record.
      </p>

      {recorded && found && (
        <p className="form-ok" role="status">
          Recorded.{" "}
          <Link href={`/${found.platform.slug}/${found.document.slug}/${recorded}`}>See it on the public site</Link>, or
          add another below.
        </p>
      )}

      <section className="section" aria-labelledby="which-title">
        <div className="section-head">
          <h2 id="which-title">Document</h2>
        </div>
        {doc && !found && <p className="form-error">That document isn&rsquo;t on the list any more. Choose another.</p>}
        <ChooseDocument
          key={doc}
          options={options}
          selected={found ? doc : undefined}
          label={found ? "Recording a version of" : "Which document is this a version of?"}
          button={found ? "Switch document" : "Continue"}
        />
        <p className="note">
          Not listed? <Link href="/admin/platforms">Add the platform or document</Link> first.
        </p>
      </section>

      {found && (
        <section className="section" aria-labelledby="record-title">
          <div className="section-head">
            <h2 id="record-title">
              {found.platform.name}: {found.document.title}
            </h2>
          </div>
          <p className="note">
            {latest
              ? `${found.versions.length === 50 ? "50+" : found.versions.length} ${found.versions.length === 1 ? "version" : "versions"} on the record. The latest was recorded ${formatDayTime(latest.capturedAt.toISOString())}; the preview compares against it.`
              : "Nothing is on the record for this document yet, so this will be its first copy."}{" "}
            <Link href={`/admin/platforms/${found.platform.slug}/${found.document.slug}`}>Document settings</Link>
          </p>
          <RecordForm
            key={`${doc}:${recorded ?? ""}`}
            platformSlug={found.platform.slug}
            documentSlug={found.document.slug}
            hasUrl={Boolean(found.document.url)}
            fromSubmission={null}
            returnTo="record-page"
            initial={{ text: "", sourceUrl: found.document.url ?? "", fetchedHash: "", submissionId: "", datedOn: "", basedOn: "" }}
          />
        </section>
      )}
    </>
  );
}
