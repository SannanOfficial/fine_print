import { createHash } from "node:crypto";

/** Kept apart from text.ts so the text helpers can also run in the browser. */
export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
