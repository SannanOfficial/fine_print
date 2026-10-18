import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/*
 * The site renders only text from our own database through React (which
 * escapes it) and loads no third-party scripts. Forms post only to our own
 * server actions; the only cookie is the admin session. The policy below
 * locks the browser down to match. 'unsafe-inline' for scripts is needed by
 * Next.js's inline bootstrap when pages are statically prerendered (nonces
 * would force every page to render per request).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // The PDF library loads its own font data at run time; leave it to Node.
  serverExternalPackages: ["pdfkit"],
  // Every visitor gets the page's title, description and link-preview tags in
  // <head>, and the complete page in the first response, instead of having them
  // streamed in afterwards. Search engines, link previews, SEO tools and
  // crawlers that don't run JavaScript all see the same finished page. The
  // record's data is cached, so this adds only milliseconds.
  htmlLimitedBots: /.*/,
  cacheLife: {
    // How long the public site may serve a cached copy of the record.
    // The crawler runs twice a day, so a few minutes of delay is harmless.
    record: {
      stale: 5 * 60,
      revalidate: 10 * 60,
      expire: 24 * 60 * 60,
    },
  },
  experimental: {
    serverActions: {
      // Submissions may carry up to 8 MB of files, plus form overhead.
      bodySizeLimit: "9mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        // These pages carry a subscriber's link token in the address.
        source: "/newsletter/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
