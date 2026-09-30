// iPhones default to saving photos as HEIC/HEIF, which no desktop or Android
// browser can display inline — opening one of these certificates just shows
// a broken-image icon. Converting to JPEG on the way in (and, as a fallback,
// on the way out for files uploaded before this existed) keeps everything
// viewable everywhere.

import convert from "heic-convert";

export function isHeic(mimeType: string): boolean {
  return mimeType === "image/heic" || mimeType === "image/heif";
}

export async function heicToJpeg(data: Buffer): Promise<Buffer> {
  const jpeg = await convert({ buffer: data, format: "JPEG", quality: 0.9 });
  return Buffer.from(jpeg);
}
