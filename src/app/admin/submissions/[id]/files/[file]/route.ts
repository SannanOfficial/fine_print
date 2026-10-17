import { getSubmissionFile } from "@/lib/admin-data.ts";
import { currentAdmin } from "@/lib/auth.ts";

/**
 * Download one attached file. Always served as a download with a sandboxing
 * policy, never rendered on our origin, because it came from the public.
 */
export async function GET(_request: Request, { params }: RouteContext<"/admin/submissions/[id]/files/[file]">) {
  if (!(await currentAdmin())) return new Response("Sign in first.", { status: 401 });
  const { id, file } = await params;
  const found = await getSubmissionFile(id, file);
  if (!found) return new Response("Not found.", { status: 404 });

  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.type,
      "Content-Length": String(found.bytes.length),
      "Content-Disposition": `attachment; filename="${found.name.replace(/["\\]/g, "_")}"`,
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
