// Cloudflare R2 (S3-compatible) storage for leave attachments — medical
// certificates. Files are private: never construct or return R2's public
// bucket URL for these keys. They're only ever served through
// app/api/leave/[leaveId]/attachment/[attachmentId]/route.ts, which enforces
// the same owner/admin/moderator check either way.

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

export const R2_BUCKET = process.env.R2_BUCKET ?? "cam-storage";

// Namespaced so this never collides with the bucket's other, unrelated files.
const KEY_PREFIX = "leave-certificates/";

export function r2Configured(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

let cachedClient: S3Client | null = null;
function r2Client(): S3Client {
  if (cachedClient) return cachedClient;
  const accountId       = process.env.R2_ACCOUNT_ID;
  const accessKeyId     = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)");
  }
  cachedClient = new S3Client({
    region:   "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

export function makeAttachmentKey(fileName: string): string {
  const safeName = (fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  return `${KEY_PREFIX}${randomUUID()}-${safeName}`;
}

export async function uploadAttachment(key: string, data: Buffer, contentType: string): Promise<void> {
  await r2Client().send(new PutObjectCommand({
    Bucket:      R2_BUCKET,
    Key:         key,
    Body:        data,
    ContentType: contentType,
  }));
}

export async function downloadAttachment(key: string): Promise<Buffer> {
  const res = await r2Client().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

/** Best-effort cleanup — never blocks or fails the caller (e.g. a cancelled leave). */
export async function deleteAttachment(key: string): Promise<void> {
  try {
    await r2Client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (error) {
    console.error("[R2] delete failed:", error);
  }
}
