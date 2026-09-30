// Browser-side helpers for medical-certificate uploads (RequestForm and the
// "📎 សំបុត្រ" upload-later button share them).

/** Shrink large photos (phone camera shots) before upload; PDFs/HEIC are sent as-is. */
export async function compressImage(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale  = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(bitmap.width  * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * The file as base64 text. Certificates travel inside JSON this way because
 * raw multipart binary arrived corrupted in production (see app/api/leave/route.ts).
 */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  // chunked: String.fromCharCode(...hugeArray) overflows the call stack
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
