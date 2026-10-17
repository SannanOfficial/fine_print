/**
 * Platforms and the documents Fine Print tracks.
 *
 * The live list is stored in the database (the `platforms` collection) and
 * edited by admins at /admin/platforms. SEED_PLATFORMS below is the starting
 * list: `npm run db:setup` adds any of these that are missing, and never
 * overwrites an admin's edits.
 */

export type CaptureMode =
  /** Fetched on a schedule by the crawler. */
  | "auto"
  /** The site blocks automated requests or needs JavaScript to show the text,
   *  so a maintainer saves the page from a browser and imports it. */
  | "manual";

export type Audience = "providers" | "clients" | "everyone";

export interface TrackedDocument {
  slug: string;
  title: string;
  audience: Audience;
  /** Public URL of the document. `null` while we still need to confirm it. */
  url: string | null;
  mode: CaptureMode;
  /** Shown on the site when `mode` is "manual", in plain language. */
  manualReason?: string;
  /** CSS selectors for the element holding the document text, tried in order. */
  selectors: string[];
  /** CSS selectors removed from inside the matched element before extraction. */
  remove?: string[];
  /** Extra hosts the URL may redirect to. The URL's own host is always allowed. */
  redirectHosts?: string[];
  /**
   * Where the crawler reads the text from. By default it loads `url` itself.
   * "zendesk-api": `url` is a Zendesk help-centre article, and the crawler
   * reads the same article from the help centre's public, read-only article
   * API, which help centres publish for programs to use. The text is
   * identical to the page; the page itself often sits behind a
   * browser-only check.
   */
  source?: "page" | "zendesk-api";
}

export interface Platform {
  /** Part of every public address. Fixed once created. */
  slug: string;
  name: string;
  /** Short description of what the platform is, for clinicians. */
  kind: string;
  website: string;
  documents: TrackedDocument[];
}

const BLOCKED_BY_SITE =
  "This site blocks automated checks, so we capture this document by hand.";
const NEEDS_BROWSER =
  "This page only shows its text after JavaScript runs, so we capture it by hand.";

export const SEED_PLATFORMS: Platform[] = [
  {
    slug: "headway",
    name: "Headway",
    kind: "Insurance credentialing and billing",
    website: "https://headway.co",
    documents: [
      {
        slug: "terms-of-service",
        title: "Terms of Service",
        audience: "everyone",
        url: null,
        mode: "manual",
        manualReason: BLOCKED_BY_SITE,
        selectors: ["main", "article", "body"],
      },
    ],
  },
  {
    slug: "alma",
    name: "Alma",
    kind: "Insurance credentialing and practice support",
    website: "https://helloalma.com",
    documents: [
      {
        slug: "provider-terms",
        title: "Provider Terms of Use",
        audience: "providers",
        url: "https://support.helloalma.com/hc/en-us/articles/360047495654",
        mode: "auto",
        source: "zendesk-api",
        selectors: ['[itemprop="articleBody"]', "article"],
      },
      {
        slug: "client-terms",
        title: "Client Terms of Use",
        audience: "clients",
        url: "https://helloalma.com/client-tou",
        mode: "auto",
        selectors: [".legaldoc"],
        redirectHosts: ["secure.helloalma.com"],
      },
    ],
  },
  {
    slug: "grow-therapy",
    name: "Grow Therapy",
    kind: "Insurance credentialing and patient referrals",
    website: "https://growtherapy.com",
    documents: [
      {
        slug: "terms-of-service",
        title: "Terms of Service",
        audience: "everyone",
        url: "https://growtherapy.com/legal/terms-of-service/",
        mode: "auto",
        selectors: ["main"],
      },
    ],
  },
  {
    slug: "simplepractice",
    name: "SimplePractice",
    kind: "Electronic health records (EHR)",
    website: "https://www.simplepractice.com",
    documents: [
      {
        slug: "terms-of-service",
        title: "Terms of Service",
        audience: "providers",
        url: "https://www.simplepractice.com/terms/",
        mode: "manual",
        manualReason: NEEDS_BROWSER,
        selectors: ["main", "body"],
        remove: ["header", "footer", "nav"],
      },
    ],
  },
  {
    slug: "rula",
    name: "Rula",
    kind: "Mental health care network and patient referrals",
    website: "https://www.rula.com",
    documents: [
      {
        slug: "terms-of-use",
        title: "Terms of Use",
        audience: "everyone",
        url: "https://www.rula.com/terms-of-use",
        mode: "auto",
        selectors: ['[data-cy="rich-text-container"]', "main"],
      },
      {
        slug: "provider-community-terms",
        title: "Provider Community Terms & Conditions",
        audience: "providers",
        url: "https://therapistsupport.rula.com/hc/en-us/articles/22104118191643",
        mode: "auto",
        source: "zendesk-api",
        selectors: ['[itemprop="articleBody"]', "article"],
      },
    ],
  },
  {
    slug: "psychology-today",
    name: "Psychology Today",
    kind: "Clinician directory",
    website: "https://www.psychologytoday.com",
    documents: [
      {
        slug: "directory-terms",
        title: "Directory Terms of Use",
        audience: "everyone",
        url: "https://docs.psychologytoday.com/directory/terms/en/latest",
        mode: "auto",
        selectors: ["#content"],
      },
    ],
  },
  {
    slug: "therapynotes",
    name: "TherapyNotes",
    kind: "Electronic health records (EHR)",
    website: "https://www.therapynotes.com",
    documents: [
      {
        slug: "terms-of-service",
        title: "Terms of Service",
        audience: "providers",
        url: null,
        mode: "manual",
        manualReason: BLOCKED_BY_SITE,
        selectors: ["main", "article", "body"],
      },
    ],
  },
];

/** Top-level routes that a platform slug must never shadow. */
export const RESERVED_SLUGS = new Set(["about", "admin", "api", "submit", "_next", "robots.txt", "sitemap.xml"]);
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MANUAL_REASONS = { blocked: BLOCKED_BY_SITE, browser: NEEDS_BROWSER } as const;

/** Problems with a platform's own fields (not its documents), as plain sentences. */
export function platformProblems(p: Pick<Platform, "slug" | "name" | "kind" | "website">): string[] {
  const problems: string[] = [];
  if (!SLUG.test(p.slug) || p.slug.length > 60) {
    problems.push("The short name must be lowercase letters, numbers and single hyphens, like “simple-practice”.");
  } else if (RESERVED_SLUGS.has(p.slug)) {
    problems.push(`“${p.slug}” is used by another page on the site. Choose a different short name.`);
  }
  if (!p.name.trim() || p.name.length > 80) problems.push("Give the platform a name of up to 80 characters.");
  if (!p.kind.trim() || p.kind.length > 120) problems.push("Describe what the platform is in up to 120 characters.");
  if (!isHttpsUrl(p.website)) problems.push("The official site must be a full https:// address.");
  return problems;
}

/** Problems with one document's fields, as plain sentences. */
export function documentProblems(d: TrackedDocument): string[] {
  const problems: string[] = [];
  if (!SLUG.test(d.slug) || d.slug.length > 60) {
    problems.push("The document's short name must be lowercase letters, numbers and single hyphens, like “terms-of-service”.");
  }
  if (!d.title.trim() || d.title.length > 120) problems.push("Give the document a title of up to 120 characters.");
  if (d.url !== null && !isHttpsUrl(d.url)) problems.push("The document's address must be a full https:// address.");
  if (d.mode === "auto" && d.url === null) problems.push("Automatic checks need the document's address.");
  if (d.mode === "manual" && !d.manualReason?.trim()) problems.push("Say why this document is captured by hand.");
  if (d.selectors.length === 0) problems.push("Give at least one place on the page to read the text from.");
  if ([...d.selectors, ...(d.remove ?? [])].some((s) => s.length > 200)) problems.push("Each selector must be under 200 characters.");
  if ((d.redirectHosts ?? []).some((h) => !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h))) {
    problems.push("Other allowed sites must be plain host names, like “secure.example.com”.");
  }
  if (d.source === "zendesk-api" && d.url && !/\/hc\/[a-z-]+\/articles\/\d+/i.test(d.url)) {
    problems.push("Reading through the help-centre API needs a Zendesk article address (…/hc/en-us/articles/123…).");
  }
  return problems;
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".");
  } catch {
    return false;
  }
}

function validate(list: Platform[]): void {
  const seen = new Set<string>();
  for (const p of list) {
    const problems = platformProblems(p);
    if (problems.length || seen.has(p.slug)) throw new Error(`Invalid platform ${p.slug}: ${problems.join(" ") || "duplicate"}`);
    seen.add(p.slug);
    const docs = new Set<string>();
    for (const d of p.documents) {
      const docIssues = documentProblems(d);
      if (docIssues.length || docs.has(d.slug)) {
        throw new Error(`Invalid document ${p.slug}/${d.slug}: ${docIssues.join(" ") || "duplicate"}`);
      }
      docs.add(d.slug);
    }
  }
}

validate(SEED_PLATFORMS);

export function findPlatform(list: Platform[], slug: string): Platform | undefined {
  return list.find((p) => p.slug === slug);
}

export function findDocument(
  list: Platform[],
  platformSlug: string,
  documentSlug: string,
): { platform: Platform; document: TrackedDocument } | undefined {
  const platform = findPlatform(list, platformSlug);
  const document = platform?.documents.find((d) => d.slug === documentSlug);
  return platform && document ? { platform, document } : undefined;
}

export function documentKey(platformSlug: string, documentSlug: string): string {
  return `${platformSlug}/${documentSlug}`;
}

export const audienceLabel: Record<Audience, string> = {
  providers: "For providers",
  clients: "For clients",
  everyone: "For everyone",
};
