import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/*
 * Admin password hashing with scrypt (built into Node, no dependency).
 * Stored as "scrypt$N$r$p$salt$hash", so the cost can be raised later
 * without breaking existing hashes.
 */

const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...options, maxmem: 128 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST);
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), { N: Number(N), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Checked against when no admin has the given email, so failures take the same time. */
export const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

/** A random password that is easy to copy: 24 characters, about 140 bits. */
export function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}
