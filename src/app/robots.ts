import type { MetadataRoute } from "next";

const siteUrl = process.env.FINEPRINT_SITE_URL ?? "https://fineprint.syedsannan.com";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: "/admin" }, sitemap: `${siteUrl}/sitemap.xml` };
}
