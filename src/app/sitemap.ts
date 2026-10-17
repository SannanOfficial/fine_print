import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getPlatforms } from "@/lib/registry.ts";

const siteUrl = process.env.FINEPRINT_SITE_URL ?? "https://fineprint.syedsannan.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const platforms = await getPlatforms();
  return [
    { url: siteUrl },
    { url: `${siteUrl}/about` },
    { url: `${siteUrl}/submit` },
    ...platforms.flatMap((p) => [
      { url: `${siteUrl}/${p.slug}` },
      ...p.documents.map((d) => ({ url: `${siteUrl}/${p.slug}/${d.slug}` })),
    ]),
  ];
}
