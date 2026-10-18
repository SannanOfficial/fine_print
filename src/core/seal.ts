import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { Binary } from "mongodb";

/*
 * Encryption for private data: submissions and newsletter addresses (AES-256-GCM).
 *
 * The key lives only in the website's environment (FINEPRINT_DATA_KEY), not
 * in the database, so a copy of the database or a backup alone does not
 * reveal who sent what. Each value is bound to its record id, so encrypted
 * values cannot be swapped between records.
 *
 * Format: version (1 byte) | IV (12) | auth tag (16) | ciphertext.
 */

const VERSION = 1;

export function dataKey(): Buffer {
  const raw = process.env.FINEPRINT_DATA_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32) {
    throw new Error("FINEPRINT_DATA_KEY must be 32 random bytes, base64-encoded. See .env.example.");
  }
  return k;
}

export function seal(plain: Buffer | string, context: string): Binary {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(typeof plain === "string" ? Buffer.from(plain, "utf8") : plain), cipher.final()]);
  return new Binary(Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]));
}

export function unseal(sealed: Binary, context: string): Buffer {
  const data = Buffer.from(sealed.buffer);
  if (data.length < 29) throw new Error("Sealed value is too short to be genuine.");
  if (data[0] !== VERSION) throw new Error("Unknown encryption format.");
  const decipher = createDecipheriv("aes-256-gcm", dataKey(), data.subarray(1, 13));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(data.subarray(13, 29));
  return Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]);
}

export const sealJson = (value: unknown, context: string) => seal(JSON.stringify(value), context);
export const unsealJson = <T>(sealed: Binary, context: string): T => JSON.parse(unseal(sealed, context).toString("utf8")) as T;

/** Keyed hash, for rate-limit keys such as IP addresses that should not be stored as-is. */
export function keyedHash(value: string): string {
  return createHmac("sha256", dataKey()).update(`fineprint:${value}`).digest("base64url").slice(0, 32);
}
