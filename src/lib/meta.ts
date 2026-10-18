import type { Metadata } from "next";

/** src/app/opengraph-image.png. Listed by hand: a page's own openGraph replaces the one Next adds from the file. */
const PREVIEW_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "Fine Print: a public record of healthcare platforms' terms, shown as a redline",
};

/** The site-wide feed of recorded changes (src/app/feed.xml/route.ts), offered on every page. */
export const FEED = { "application/atom+xml": [{ url: "/feed.xml", title: "Fine Print: recorded changes" }] };

/**
 * Title, description and link-preview tags for a public page. Each page sets
 * its own Open Graph fields because Next replaces the layout's `openGraph`
 * (and `alternates`) rather than merging into them.
 *
 * A redline page is an "article", dated when the change was recorded.
 */
export function pageMetadata({
  title,
  description,
  path,
  article,
}: {
  title: string;
  description: string;
  path: string;
  article?: { publishedTime: string; section: string };
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path, types: FEED },
    openGraph: {
      siteName: "Fine Print",
      locale: "en_US",
      title,
      description,
      url: path,
      images: [PREVIEW_IMAGE],
      ...(article
        ? { type: "article" as const, publishedTime: article.publishedTime, section: article.section }
        : { type: "website" as const }),
    },
    twitter: { card: "summary_large_image", title, description, images: [PREVIEW_IMAGE] },
  };
}
