import { contactEmail, publicSiteUrl, SITE_DESCRIPTION } from "@/core/site.ts";

/*
 * Structured data (schema.org JSON-LD) that tells search engines what each
 * page is: the site and who runs it, where a page sits (breadcrumbs), and
 * which platform's document a page is about.
 *
 * A platform wrote its terms; Fine Print only keeps copies. So documents are
 * described as published by the platform, and our pages as being about them.
 */

type Thing = Record<string, unknown>;

/** Writes the data into the page. `<` is escaped, so no text can close the script element early. */
export function JsonLd({ data }: { data: Thing[] }) {
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": data }).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

/** An absolute address on this site. */
export const absolute = (path: string) => `${publicSiteUrl()}${path === "/" ? "" : path}`;

const websiteId = () => `${publicSiteUrl()}/#website`;
const publisherId = () => `${publicSiteUrl()}/#publisher`;

/** The site itself and who runs it. Goes on the home page. */
export function siteEntities(): Thing[] {
  return [
    {
      "@type": "WebSite",
      "@id": websiteId(),
      url: absolute("/"),
      name: "Fine Print",
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": publisherId() },
    },
    {
      "@type": "Organization",
      "@id": publisherId(),
      name: "Fine Print",
      url: absolute("/"),
      logo: { "@type": "ImageObject", url: absolute("/icon.png"), width: 512, height: 512 },
      email: contactEmail(),
      founder: { "@type": "Person", name: "Syed Muhammad Sannan", url: "https://syedsannan.com" },
    },
  ];
}

/** "Fine Print › Headway › Terms of Service", for the trail search results show. */
export function breadcrumbs(items: { name: string; path: string }[]): Thing {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Fine Print", path: "/" }, ...items].map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absolute(item.path),
    })),
  };
}

/** A platform, as the organisation that publishes the terms. */
export function platformEntity(platform: { name: string; website: string }): Thing {
  return { "@type": "Organization", name: platform.name, url: platform.website };
}

/** A platform's document (the terms themselves), published by the platform. */
export function documentEntity(
  platform: { name: string; website: string },
  document: { title: string; url: string | null },
): Thing {
  return {
    "@type": "DigitalDocument",
    name: `${platform.name} ${document.title}`,
    ...(document.url ? { url: document.url } : {}),
    publisher: platformEntity(platform),
    inLanguage: "en",
  };
}

/** One of our pages. */
export function webPage(page: {
  path: string;
  name: string;
  description: string;
  type?: "WebPage" | "AboutPage" | "CollectionPage" | "ContactPage";
  datePublished?: string;
  dateModified?: string;
  about?: Thing;
}): Thing {
  return {
    "@type": page.type ?? "WebPage",
    "@id": `${absolute(page.path)}#webpage`,
    url: absolute(page.path),
    name: page.name,
    description: page.description,
    inLanguage: "en",
    isPartOf: { "@id": websiteId() },
    publisher: { "@id": publisherId() },
    ...(page.datePublished ? { datePublished: page.datePublished } : {}),
    ...(page.dateModified ? { dateModified: page.dateModified } : {}),
    ...(page.about ? { about: page.about } : {}),
  };
}
