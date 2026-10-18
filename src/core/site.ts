/** Facts about this installation that both the website and the jobs need. */

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
