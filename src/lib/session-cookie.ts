/** "__Host-" makes browsers refuse the cookie unless it is Secure, host-only and Path=/. */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-fineprint_admin" : "fineprint_admin";

/**
 * Where to go after signing in: an admin address from the `next` parameter,
 * or the dashboard. Anything else (another site, "//evil.example") is ignored.
 */
export function afterLogin(next: string | null | undefined): string {
  if (!next || next.length > 300) return "/admin";
  return /^\/admin(?:\/[A-Za-z0-9_\-/]*)?(?:\?[A-Za-z0-9_\-=&%./]*)?$/.test(next) && !next.includes("//") && !next.startsWith("/admin/login")
    ? next
    : "/admin";
}
