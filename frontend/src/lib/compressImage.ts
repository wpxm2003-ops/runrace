const MAX_UPLOAD_BYTES = 900_000;
const MAX_EDGE_PX = 1920;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/** 업로드 전 이미지 리사이즈·압축 (nginx 1MB 제한 대비). */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= MAX_UPLOAD_BYTES) {
    return file;
  }

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const outputType = file.type === "image/png" ? "image/jpeg" : file.type;
  let quality = 0.85;
  let blob: Blob | null = null;

  while (quality >= 0.45) {
    blob = await canvasToBlob(canvas, outputType, quality);
    if (!blob || blob.size <= MAX_UPLOAD_BYTES) break;
    quality -= 0.1;
  }

  if (!blob || blob.size >= file.size) {
    return file;
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "upload";
  const ext = outputType === "image/png" ? ".png" : ".jpg";
  return new File([blob], `${baseName}${ext}`, { type: outputType });
}
