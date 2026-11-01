"use client";
/** Shrink a picture in the browser before upload (phone photos are often 4–8 MB). */
export async function resizeImage(file: File, max: number, opts: { square?: boolean; type?: "image/png" | "image/jpeg"; quality?: number } = {}): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas");
  c.width = opts.square ? max : w; c.height = opts.square ? max : h;
  const g = c.getContext("2d")!;
  if (opts.type === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, opts.square ? (max - w) / 2 : 0, opts.square ? (max - h) / 2 : 0, w, h);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, opts.type ?? "image/png", opts.quality ?? 0.88));
  if (!blob) throw new Error("Could not read the picture.");
  return blob;
}

/** Photos for the gallery: JPEG, at most 2400 px, unless the original is already small. */
export async function shrinkPhoto(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 700 * 1024) return file;
  try {
    const b = await resizeImage(file, 2400, { type: "image/jpeg", quality: 0.86 });
    return b.size < file.size ? new File([b], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}
