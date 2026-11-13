import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** URL-safe random token; only its SHA-256 is stored. */
export function newToken(bytes = 32): { token: string; hash: string } {
  const token = randomBytes(bytes).toString("base64url");
  return { token, hash: sha256Hex(token) };
}

export function maskTail(value: string | null | undefined, visible = 4): string {
  if (!value) return "";
  if (value.length <= visible) return "•".repeat(value.length);
  return "•".repeat(Math.min(8, value.length - visible)) + value.slice(-visible);
}
