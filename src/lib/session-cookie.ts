/** "__Host-" makes browsers refuse the cookie unless it is Secure, host-only and Path=/. */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-fineprint_admin" : "fineprint_admin";
