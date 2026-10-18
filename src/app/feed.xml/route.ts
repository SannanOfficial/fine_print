import { connection } from "next/server";
import { findDocument } from "@/core/platforms.ts";
import { publicSiteUrl, SITE_DESCRIPTION } from "@/core/site.ts";
import { getRecentChanges } from "@/lib/data.ts";
import { describeStats, formatDay } from "@/lib/format.ts";
import { getPlatforms } from "@/lib/registry.ts";

/*
 * An Atom feed of the latest recorded changes, for feed readers and for
 * search engines, which read feeds to find new pages quickly. Linked from
 * every page's <head>.
 */

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export async function GET() {
  await connection();
  const site = publicSiteUrl();
  const [platforms, changes] = await Promise.all([getPlatforms(), getRecentChanges(50)]);

  const entries = changes.flatMap((v) => {
    const found = findDocument(platforms, v.platform, v.document);
    if (!found) return [];
    const url = `${site}/${v.platform}/${v.document}/${v.id}`;
    const name = `${found.platform.name} ${found.document.title}`;
    const s = v.summary;
    // Who wrote a summary is said first, as on the site.
    const label = !s ? null : !s.byAi ? "Summary by an editor" : s.reviewed ? "AI summary, checked by an editor" : "AI summary, not yet checked by an editor";
    const summary = s
      ? `${label}: ${[s.headline, ...s.points].join(" ")} The redline is the exact record.`
      : `${describeStats(v.stats)}. The redline shows exactly what changed.`;
    return [
      `  <entry>
    <title>${xml(`${name} changed (${formatDay(v.capturedAt)})`)}</title>
    <link rel="alternate" type="text/html" href="${xml(url)}"/>
    <id>${xml(url)}</id>
    <published>${v.capturedAt}</published>
    <updated>${v.capturedAt}</updated>
    <category term="${xml(v.platform)}" label="${xml(found.platform.name)}"/>
    <summary>${xml(summary)}</summary>
  </entry>`,
    ];
  });

  const body = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
  <title>Fine Print: recorded changes</title>
  <subtitle>${xml(SITE_DESCRIPTION)}</subtitle>
  <link rel="self" type="application/atom+xml" href="${xml(`${site}/feed.xml`)}"/>
  <link rel="alternate" type="text/html" href="${xml(site)}"/>
  <id>${xml(`${site}/`)}</id>
  <updated>${changes[0]?.capturedAt ?? new Date(0).toISOString()}</updated>
  <author><name>Fine Print</name><uri>${xml(site)}</uri></author>
  <icon>${xml(`${site}/icon.png`)}</icon>
${entries.join("\n")}
</feed>
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
