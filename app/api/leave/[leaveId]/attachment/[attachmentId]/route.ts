import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { appBaseUrl, attachmentPath, leaveOwnerEmail } from "@/lib/leaveServer";

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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isReviewer = loggedInUser.role === "ADMIN" || loggedInUser.role === "MODERATOR";
  if (!isReviewer && attachment.leave.userEmail !== leaveOwnerEmail(loggedInUser)) {
    return new NextResponse(
      "អ្នកមិនមានសិទ្ធិមើលឯកសារនេះទេ (You are not allowed to view this file).",
      { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const asciiName = attachment.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return new NextResponse(new Uint8Array(attachment.data), {
    status: 200,
    headers: {
      "Content-Type":        attachment.mimeType,
      "Content-Length":      String(attachment.size),
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "Cache-Control":       "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
