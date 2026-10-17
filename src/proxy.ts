import { NextResponse, type NextRequest } from "next/server";
import { SLUG } from "./core/platforms.ts";
import { isKnownPath } from "./lib/known-paths.ts";
import { SESSION_COOKIE } from "./lib/session-cookie.ts";

/**
 * Answer unknown platform, document and version addresses with a real 404
 * before any page starts streaming (a page that has started streaming can
 * only send a 200). The list of known addresses is kept in memory for a few
 * seconds (see known-paths.ts), so this rarely touches the database.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/admin" || path.startsWith("/admin/")) {
    // A quick check for a session cookie only, so signed-out visitors get a
    // plain redirect. Pages and actions still verify the session properly.
    if (path !== "/admin/login" && !request.cookies.has(SESSION_COOKIE)) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  let segments: string[];
  try {
    segments = request.nextUrl.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    segments = []; // malformed percent-encoding
  }
  const [platform, document, version] = segments;

  const wellFormed =
    segments.length >= 1 &&
    segments.length <= 3 &&
    SLUG.test(platform) &&
    (document === undefined || SLUG.test(document)) &&
    (version === undefined || /^[a-f0-9]{24}$/.test(version));

  // If the database can't be reached, let the page answer for itself.
  if (wellFormed && (await isKnownPath(platform, document)) !== false) return NextResponse.next();
  return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
}

export const config = {
  // Everything except static files, Next.js internals and the fixed top-level pages.
  matcher: ["/((?!_next/|about$|submit$|robots\\.txt$|sitemap\\.xml$|favicon\\.ico$).+)"],
};
