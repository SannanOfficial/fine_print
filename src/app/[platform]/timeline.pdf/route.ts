import { cacheLife, cacheTag } from "next/cache";
import { type NextRequest, connection } from "next/server";
import { publicSiteUrl } from "@/core/site.ts";
import { getEvents, getHistory } from "@/lib/data.ts";
import { recordPdf } from "@/lib/record-pdf.ts";
import { getPlatform } from "@/lib/registry.ts";
import { buildTimeline, standingOf } from "@/lib/timeline.ts";

/*
 * /headway/timeline.pdf: the company's record as a PDF to save, print or
 * share. Built from the same timeline as the platform page, and cached like
 * the rest of the record, so a busy link doesn't rebuild it each time.
 */

async function cachedPdf(slug: string): Promise<{ pdf: Uint8Array; day: string } | null> {
  "use cache";
  cacheLife("record");
  cacheTag("versions", "summaries", "registry", "events");

  const platform = await getPlatform(slug);
  if (!platform) return null;
  const [history, events] = await Promise.all([getHistory(slug), getEvents(slug)]);
  const timeline = buildTimeline(platform, history, events);
  const generatedAt = new Date();
  const pdf = await recordPdf({ platform, standing: standingOf(platform, timeline, generatedAt), timeline, siteUrl: publicSiteUrl(), generatedAt });
  return { pdf: new Uint8Array(pdf), day: generatedAt.toISOString().slice(0, 10) };
}

export async function GET(_request: NextRequest, { params }: RouteContext<"/[platform]/timeline.pdf">) {
  await connection();
  const { platform } = await params;
  const result = await cachedPdf(platform);
  if (!result) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(result.pdf as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fine-print-${platform}-${result.day}.pdf"`,
      "Cache-Control": "public, max-age=600",
      // Search engines should send people to the page, which has the same content.
      Link: `<${publicSiteUrl()}/${platform}>; rel="canonical"`,
    },
  });
}
