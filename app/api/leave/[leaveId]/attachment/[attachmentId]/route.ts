import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { appBaseUrl, attachmentPath, leaveOwnerEmail } from "@/lib/leaveServer";
import { downloadAttachment } from "@/lib/r2";
import { heicToJpeg, isHeic } from "@/lib/heic";

type Params = { params: { leaveId: string; attachmentId: string } };

// GET — view a leave's supporting document (owner, moderators and admins only)
export async function GET(_req: Request, { params }: Params) {
  const loggedInUser = await getCurrentUser();
  if (!loggedInUser) {
    // Opened from the Telegram button while logged out → log in, then come back
    const back = attachmentPath(params.leaveId, params.attachmentId);
    return NextResponse.redirect(`${appBaseUrl()}/login?callbackUrl=${encodeURIComponent(back)}`);
  }

  const attachment = await prisma.leaveAttachment.findFirst({
    where:   { id: params.attachmentId, leaveId: params.leaveId },
    include: { leave: { select: { userEmail: true } } },
  });
  if (!attachment) {
    // An old Telegram button can point at a certificate that has since been
    // re-uploaded — send it to the leave's current one instead of a 404.
    const current = await prisma.leaveAttachment.findFirst({
      where:   { leaveId: params.leaveId },
      orderBy: { createdAt: "desc" },
      select:  { id: true },
    });
    if (current) {
      return NextResponse.redirect(`${appBaseUrl()}${attachmentPath(params.leaveId, current.id)}`);
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isReviewer = loggedInUser.role === "ADMIN" || loggedInUser.role === "MODERATOR";
  if (!isReviewer && attachment.leave.userEmail !== leaveOwnerEmail(loggedInUser)) {
    return new NextResponse(
      "អ្នកមិនមានសិទ្ធិមើលឯកសារនេះទេ (You are not allowed to view this file).",
      { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  // New uploads live in R2; older ones (before R2 was wired up) still have
  // their bytes in the database.
  let bytes: Uint8Array;
  try {
    bytes = attachment.r2Key ? await downloadAttachment(attachment.r2Key) : new Uint8Array(attachment.data!);
  } catch (error) {
    console.error("[attachment] fetch failed:", error);
    return NextResponse.json({ error: "Could not load the file" }, { status: 502 });
  }

  // Certificates uploaded before HEIC→JPEG conversion was added at upload
  // time are still stored as HEIC/HEIF — no browser can render that inline,
  // so convert on the fly here too.
  let mimeType = attachment.mimeType;
  let fileName = attachment.fileName;
  if (isHeic(mimeType)) {
    bytes    = await heicToJpeg(Buffer.from(bytes));
    mimeType = "image/jpeg";
    fileName = fileName.replace(/\.(heic|heif)$/i, "") + ".jpg";
  }

  const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type":        mimeType,
      "Content-Length":      String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control":       "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
