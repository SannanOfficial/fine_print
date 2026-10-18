import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getPlatformForEdit } from "@/lib/admin-data.ts";
import { requireAdmin } from "@/lib/auth.ts";
import { AdminBar } from "../../AdminBar.tsx";
import { AdminStatus } from "../AdminStatus.tsx";
import { DeleteForm, DocumentForm, PlatformForm } from "../forms.tsx";

export default function PlatformAdmin({ params, searchParams }: PageProps<"/admin/platforms/[platform]">) {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      {Promise.all([params, searchParams]).then(([{ platform }, query]) => (
        <PlatformEditor slug={platform} notice={typeof query.added === "string" ? "added" : typeof query.deleted === "string" ? "deleted" : null} />
      ))}
    </Suspense>
  );
}

async function PlatformEditor({ slug, notice }: { slug: string; notice: "added" | "deleted" | null }) {
  const admin = await requireAdmin();
  const p = await getPlatformForEdit(slug);
  if (!p) notFound();
  const hasVersions = p.rows.some((d) => d.versions > 0);

  return (
    <>
      <AdminBar admin={admin} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/admin/platforms">All platforms</Link>
      </nav>
      <p className="eyebrow">{p.kind}</p>
      <h1>{p.name}</h1>
      {notice && (
        <p className="form-ok" role="status">
          {notice === "added" ? "Platform added. Now add the documents to track." : "The document was deleted."}
        </p>
      )}
      <p className="note">
        Public page: <Link href={`/${p.slug}`}>/{p.slug}</Link>
      </p>

      <section className="section" aria-labelledby="docs-title">
        <div className="section-head">
          <h2 id="docs-title">Documents</h2>
        </div>
        {p.rows.length === 0 ? (
          <p className="empty">No documents yet. Add the first one below.</p>
        ) : (
          <ul className="index-docs admin-docs">
            {p.rows.map((d) => (
              <li key={d.slug}>
                <Link href={`/admin/platforms/${p.slug}/${d.slug}`}>{d.title}</Link>
                <span className="leader" aria-hidden="true" />
                <AdminStatus row={d} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="add-doc-title">
        <div className="section-head">
          <h2 id="add-doc-title">Add a document</h2>
        </div>
        <DocumentForm
          platformSlug={p.slug}
          initial={{
            slug: "",
            title: "",
            audience: "providers",
            url: "",
            mode: "auto",
            manualPreset: "blocked",
            manualCustom: "",
            selectors: "",
            remove: "",
            redirectHosts: "",
            source: "",
          }}
        />
      </section>

      <section className="section" aria-labelledby="edit-title">
        <div className="section-head">
          <h2 id="edit-title">Platform details</h2>
        </div>
        <PlatformForm slug={p.slug} initial={{ slug: p.slug, name: p.name, kind: p.kind, website: p.website }} />
      </section>

      {!hasVersions && (
        <section className="section" aria-labelledby="delete-title">
          <div className="section-head">
            <h2 id="delete-title">Delete</h2>
          </div>
          <DeleteForm platformSlug={p.slug} hint="Removes the platform and its documents. Only possible while nothing has been recorded for it." />
        </section>
      )}
      {hasVersions && (
        <p className="note">
          This platform can&rsquo;t be deleted because it has versions on the record, which stay public for good. To stop
          automatic checks, set each document to &ldquo;By hand&rdquo; in its settings.
        </p>
      )}
    </>
  );
}
