"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Paperclip } from "lucide-react";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, RULE_MESSAGES } from "@/lib/leaveRules";
import { compressImage, fileToBase64 } from "@/lib/attachmentUpload";

type Props = {
  leaveId: string;
  // true = a certificate is already attached, so this replaces it
  hasCertificate: boolean;
};

/**
 * Upload the medical certificate for one's own sick leave after submitting
 * it ("ជំពាក់សិន"), or replace one that's wrong/unreadable. Works at any
 * stage except rejected — see PUT /api/leave/[leaveId]/attachment.
 */
export default function CertificateUploadButton({ leaveId, hasCertificate }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (!ALLOWED_ATTACHMENT_TYPES.includes(picked.type)) {
      toast.error(RULE_MESSAGES.attachmentType, { duration: 6000 });
      return;
    }
    setBusy(true);
    try {
      const file = await compressImage(picked);
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(RULE_MESSAGES.attachmentSize, { duration: 6000 });
        return;
      }
      const res = await fetch(`/api/leave/${leaveId}/attachment`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ attachment: { fileName: file.name, mimeType: file.type, base64: await fileToBase64(file) } }),
      });
      if (res.ok) {
        toast.success(hasCertificate ? "បានប្ដូរសំបុត្រពេទ្យ (Certificate replaced)" : "បានភ្ជាប់សំបុត្រពេទ្យ (Certificate uploaded)", { duration: 4000 });
        router.refresh();
      } else if (res.status === 413) {
        toast.error(RULE_MESSAGES.attachmentSize, { duration: 7000 });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Upload failed", { duration: 7000 });
      }
    } catch (error) {
      console.error(error);
      toast.error("Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label
      title={hasCertificate ? "ប្ដូរសំបុត្រពេទ្យ (Replace certificate)" : "ភ្ជាប់សំបុត្រពេទ្យ (Upload certificate)"}
      className={
        "inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors " +
        (busy ? "pointer-events-none opacity-60 " : "") +
        (hasCertificate
          ? "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          : "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300")
      }
    >
      <Paperclip className="h-3 w-3" />
      {busy ? "..." : hasCertificate ? "ប្ដូរសំបុត្រ" : "Upload សំបុត្រ"}
      <input type="file" accept={ALLOWED_ATTACHMENT_TYPES.join(",")} className="sr-only" onChange={onPick} disabled={busy} />
    </label>
  );
}
