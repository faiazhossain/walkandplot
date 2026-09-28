// PRD 34: photos are compressed to data URIs before storage - longest edge
// 1280px, JPEG quality 0.8. The dimension math is pure (unit-tested in Node);
// the canvas encode needs the browser.

export const PHOTO_MAX_EDGE = 1280;
export const PHOTO_JPEG_QUALITY = 0.8;

/** Target dimensions fitting within maxEdge, never upscaling. */
export function scaledDimensions(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** PRD 34: exact, calm message when a photo cannot persist. */
export const PHOTO_QUOTA_MESSAGE =
  "Storage is full, so the photo was skipped. Your map changes are saved.";

/**
 * Browser-only: downscale an image file to a JPEG data URI (PRD 34).
 * Resolves to null when the file is not a readable image.
 */
export async function fileToPhotoDataUri(file: File): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const { width, height } = scaledDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}
