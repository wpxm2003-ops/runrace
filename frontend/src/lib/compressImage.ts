const MAX_UPLOAD_BYTES = 600_000;
/** 러닝머신 화면은 1000px면 충분 */
const MAX_EDGE_PX = 1000;
const JPEG_QUALITY = 0.65;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

function toOutputFile(blob: Blob, original: File): File {
  const baseName = original.name.replace(/\.[^.]+$/, "") || "upload";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

/** createImageBitmap 리사이즈 — 전체 해상도 디코딩 없이 축소 (모바일에서 훨씬 빠름) */
async function compressWithBitmap(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, {
    resizeWidth: MAX_EDGE_PX,
    resizeQuality: "medium",
  });

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("canvas_unavailable");
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  if (!blob) throw new Error("blob_failed");
  return toOutputFile(blob, file);
}

/** 구형 WebView 폴백 */
async function compressWithImage(file: File): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image_load_failed")); };
    el.src = url;
  });

  const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  if (!blob) return file;
  return toOutputFile(blob, file);
}

/** 업로드 전 이미지 리사이즈·압축. 600KB 이하 목표. */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= MAX_UPLOAD_BYTES) {
    return file;
  }

  try {
    const compressed =
      typeof createImageBitmap === "function"
        ? await compressWithBitmap(file)
        : await compressWithImage(file);
    if (compressed.size <= MAX_UPLOAD_BYTES || compressed.size < file.size) {
      return compressed;
    }
    return file;
  } catch {
    try {
      return await compressWithImage(file);
    } catch {
      return file;
    }
  }
}
