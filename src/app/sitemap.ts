import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getDocumentFacts, getHistory } from "@/lib/data.ts";
import { getPlatforms } from "@/lib/registry.ts";

const siteUrl = (process.env.FINEPRINT_SITE_URL ?? "https://fineprint.syedsannan.com").replace(/\/+$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const [platforms, facts, history] = await Promise.all([getPlatforms(), getDocumentFacts(), getHistory()]);
  const tracked = new Set(platforms.flatMap((p) => p.documents.map((d) => `${p.slug}/${d.slug}`)));
  const changedOn = (key: string) => facts[key]?.latest.capturedAt;
  return [
    { url: siteUrl },
    { url: `${siteUrl}/about` },
    { url: `${siteUrl}/submit` },
    ...platforms.flatMap((p) => [
      { url: `${siteUrl}/${p.slug}` },
      ...p.documents.map((d) => ({ url: `${siteUrl}/${p.slug}/${d.slug}`, lastModified: changedOn(`${p.slug}/${d.slug}`) })),
    ]),
    // Each redline: the pages people share.
    ...history
      .filter((v) => !v.isFirst && tracked.has(`${v.platform}/${v.document}`))
      .map((v) => ({ url: `${siteUrl}/${v.platform}/${v.document}/${v.id}`, lastModified: v.capturedAt })),
  ];
}
