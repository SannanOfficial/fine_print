import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { documentKey } from "@/core/platforms.ts";
import { publicSiteUrl } from "@/core/site.ts";
import { getAllChanges, getDocumentFacts } from "@/lib/data.ts";
import { getPlatforms } from "@/lib/registry.ts";

/**
 * Every public page: the fixed pages, each platform and document, and every
 * redline (the pages people share). Each is dated by the last change it
 * shows, so search engines know what to fetch again.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const siteUrl = publicSiteUrl();
  const [platforms, facts, changes] = await Promise.all([getPlatforms(), getDocumentFacts(), getAllChanges()]);
  const tracked = new Set(platforms.flatMap((p) => p.documents.map((d) => documentKey(p.slug, d.slug))));
  const latestOf = (keys: string[]) =>
    keys
      .map((k) => facts[k]?.latest.capturedAt)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1);
  const everything = latestOf([...tracked]);

  return [
    { url: siteUrl, lastModified: everything, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/submit`, changeFrequency: "yearly", priority: 0.5 },
    ...platforms.flatMap((p) => [
      {
        url: `${siteUrl}/${p.slug}`,
        lastModified: latestOf(p.documents.map((d) => documentKey(p.slug, d.slug))),
        changeFrequency: "weekly" as const,
        priority: 0.9,
      },
      ...p.documents.map((d) => ({
        url: `${siteUrl}/${p.slug}/${d.slug}`,
        lastModified: latestOf([documentKey(p.slug, d.slug)]),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ]),
    // A redline never changes once recorded.
    ...changes
      .filter((v) => tracked.has(documentKey(v.platform, v.document)))
      .map((v) => ({
        url: `${siteUrl}/${v.platform}/${v.document}/${v.id}`,
        lastModified: v.capturedAt,
        changeFrequency: "never" as const,
        priority: 0.7,
      })),
  ];
}
