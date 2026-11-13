import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { UserError } from "./errors";

/**
 * AES-256-GCM for integration credentials stored in the database.
 * CREWLANE_ENCRYPTION_KEY is 32 bytes, base64. In development it falls back
 * to a key derived from BETTER_AUTH_SECRET.
 */
function key(): Buffer {
  const k = process.env.CREWLANE_ENCRYPTION_KEY;
  if (k) {
    const buf = Buffer.from(k, "base64");
    if (buf.length !== 32) throw new UserError("CREWLANE_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
    return buf;
  }
  if (process.env.NODE_ENV === "production") {
    throw new UserError("Secrets cannot be stored: the server has no CREWLANE_ENCRYPTION_KEY. Ask your administrator to set it.");
  }
  return createHash("sha256").update(`crewlane-dev:${process.env.BETTER_AUTH_SECRET ?? "dev"}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, body] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}
