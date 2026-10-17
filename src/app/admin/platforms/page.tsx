import Link from "next/link";
import { Suspense } from "react";
import { listPlatformsWithFacts } from "@/lib/admin-data.ts";
import { requireAdmin } from "@/lib/auth.ts";
import { AdminBar } from "../AdminBar.tsx";
import { AdminStatus } from "./AdminStatus.tsx";
import { PlatformForm } from "./forms.tsx";

export const metadata = { title: "Platforms" };

export default function PlatformsAdmin({ searchParams }: PageProps<"/admin/platforms">) {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <PlatformList deleted={searchParams.then((p) => p.deleted === "1")} />
    </Suspense>
  );
}

async function PlatformList({ deleted }: { deleted: Promise<boolean> }) {
  const admin = await requireAdmin();
  const platforms = await listPlatformsWithFacts();

  return (
    <>
      <AdminBar admin={admin} />
      <h1 className="admin-title">Platforms</h1>
      <p className="lede">
        Everything the public record tracks. Add a platform, add its documents, then record versions by fetching,
        uploading or pasting them.
      </p>
      {(await deleted) && (
        <p className="form-ok" role="status">
          The platform was deleted.
        </p>
      )}

      <section className="section" aria-labelledby="list-title">
        <div className="section-head">
          <h2 id="list-title">Tracked platforms</h2>
          <span className="label">{platforms.length}</span>
        </div>
        {platforms.length === 0 ? (
          <p className="empty">
            No platforms yet. Run <code>npm run db:setup</code> to load the starting list, or add one below.
          </p>
        ) : (
          <ul className="index">
            {platforms.map((p) => (
              <li key={p.slug} className="index-row">
                <p className="index-head">
                  <Link href={`/admin/platforms/${p.slug}`} className="index-name">
                    {p.name}
                  </Link>
                  <span className="index-kind">{p.kind}</span>
                </p>
                {p.rows.length === 0 ? (
                  <p className="note">No documents yet.</p>
                ) : (
                  <ul className="index-docs">
                    {p.rows.map((d) => (
                      <li key={d.slug}>
                        <Link href={`/admin/platforms/${p.slug}/${d.slug}`}>{d.title}</Link>
                        <span className="leader" aria-hidden="true" />
                        <AdminStatus row={d} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="add-title">
        <div className="section-head">
          <h2 id="add-title">Add a platform</h2>
        </div>
        <PlatformForm initial={{ slug: "", name: "", kind: "", website: "" }} />
      </section>
    </>
  );
}
