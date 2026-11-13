/**
 * File storage. STORAGE_DRIVER=local (default, STORAGE_DIR) for development,
 * or s3 for any S3-compatible store (AWS S3, MinIO, Cloudflare R2). Keys are
 * always prefixed with the tenant id.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { UserError } from "./errors";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const MAX_BYTES = 15 * 1024 * 1024;

export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/csv": "csv",
};

let s3: S3Client | null = null;
function client() {
  return (s3 ??= new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  }));
}

function driver() {
  return process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
}

function localPath(key: string) {
  const root = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? ".storage");
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid key");
  return full;
}

export function objectKey(tenantId: string, folder: string, fileName: string) {
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  return `${tenantId}/${folder}/${crypto.randomUUID()}-${safe}`;
}

export async function putFile(key: string, file: File) {
  if (file.size > MAX_BYTES) throw new UserError("Files must be 15 MB or smaller.");
  if (!ALLOWED_TYPES[file.type]) throw new UserError("Upload a PDF, PNG, JPEG, WebP or CSV file.");
  const body = Buffer.from(await file.arrayBuffer());
  if (driver() === "s3") {
    await client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: file.type }));
  } else {
    const p = localPath(key);
    await mkdir(/*turbopackIgnore: true*/ path.dirname(p), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ p, body);
  }
}

export async function getFile(key: string): Promise<Buffer> {
  if (driver() === "s3") {
    const res = await client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  return readFile(/*turbopackIgnore: true*/ localPath(key));
}
