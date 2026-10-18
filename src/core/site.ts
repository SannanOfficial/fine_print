/** Facts about this installation that both the website and the jobs need. */

/** Where the site lives, unless FINEPRINT_SITE_URL says otherwise. */
export const DEFAULT_SITE_URL = "https://fineprint.syedsannan.com";

/**
 * The site's public address, without a trailing slash: canonical links, the
 * sitemap, the feed and structured data all use it. Set FINEPRINT_SITE_URL
 * for both `next build` and `next start`, since some pages are built ahead.
 */
export function publicSiteUrl(): string {
  return (process.env.FINEPRINT_SITE_URL?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

/** One line on what the site is, for search results and link previews (under 160 characters). */
export const SITE_DESCRIPTION =
  "A free, public record of the terms EHRs, billing services, telehealth networks and directories ask clinicians to accept, with every change shown as a redline.";

/** The maintainer's address, used unless FINEPRINT_CONTACT_EMAIL names another. */
export const DEFAULT_CONTACT_EMAIL = "contact@syedsannan.com";

/** Where the project takes optional support for its upkeep. */
export const PATREON_URL = "https://www.patreon.com/c/SannanOfficial/membership";

/**
 * Where readers write with corrections and questions. Also the reply address
 * of every email the site sends.
 */
export function contactEmail(): string {
  const value = process.env.FINEPRINT_CONTACT_EMAIL?.trim();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : DEFAULT_CONTACT_EMAIL;
}
