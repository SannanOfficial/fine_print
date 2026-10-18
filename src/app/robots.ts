import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/core/site.ts";

/**
 * Everything public may be crawled. The admin pages and the newsletter's
 * personal links (which carry a subscriber's token) are kept out; they also
 * say "noindex" themselves.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/newsletter/"] },
    sitemap: `${publicSiteUrl()}/sitemap.xml`,
  };
}
