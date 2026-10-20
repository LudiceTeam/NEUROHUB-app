// Photos are prepared in the browser before upload: big ones are scaled down and re-encoded
// as JPEG (faster upload, fits the 5 MB limit). What the browser can't decode — HEIC in
// Chrome/Firefox — is sent as is and converted on the server.
const MODEL_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIDE = 2048;
const KEEP_BELOW = 1.5 * 1024 * 1024;   // supported photos smaller than this are sent untouched

export const isImageFile = (file) => file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);

export async function prepareImage(file) {
  if (file.type === "image/gif") return file;   // keep animations
  if (MODEL_TYPES.has(file.type) && file.size <= KEEP_BELOW) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";   // transparent PNG areas become white, not black, in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob || (MODEL_TYPES.has(file.type) && blob.size >= file.size)) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
