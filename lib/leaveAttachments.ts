// Where a leave's medical certificate is kept. Shared by leave creation,
// the owner's edit, and the "upload certificate later" endpoint, so every
// path stores files the same way.

import prisma from "@/lib/prisma";
import { deleteAttachment, makeAttachmentKey, r2Configured, uploadAttachment } from "@/lib/r2";

type ReadAttachment = { fileName: string; mimeType: string; size: number; data: Buffer };

export type AttachmentCreate = { fileName: string; mimeType: string; size: number; r2Key?: string; data?: Buffer };

/**
 * Store the file in Cloudflare R2 when it's configured; otherwise keep the
 * bytes in the database (the original behavior), so an upload is never lost.
 * Either way it lives outside the app container and survives redeploys.
 */
export async function storeAttachment(attachment: ReadAttachment): Promise<AttachmentCreate> {
  if (!r2Configured()) return attachment;
  const key = makeAttachmentKey(attachment.fileName);
  await uploadAttachment(key, attachment.data, attachment.mimeType);
  return { fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size, r2Key: key };
}

/** Replace all of a leave's certificates with `created`; returns the new attachment id. */
export async function replaceLeaveAttachments(leaveId: string, created: AttachmentCreate): Promise<string> {
  const old = await prisma.leaveAttachment.findMany({ where: { leaveId }, select: { id: true, r2Key: true } });

  const [, row] = await prisma.$transaction([
    prisma.leaveAttachment.deleteMany({ where: { leaveId } }),
    prisma.leaveAttachment.create({ data: { leaveId, ...created }, select: { id: true } }),
  ]);

  // Only after the DB points at the new file: drop the old objects from R2
  for (const a of old) {
    if (a.r2Key) void deleteAttachment(a.r2Key);
  }
  return row.id;
}
