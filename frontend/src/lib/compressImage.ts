const MAX_UPLOAD_BYTES = 900_000;
/** 러닝머신 사진은 1200px 이상 불필요 */
const MAX_EDGE_PX = 1200;
/** 첫 시도 품질 — 대부분 한 번에 통과 */
const INITIAL_QUALITY = 0.75;
const MIN_QUALITY = 0.4;
const QUALITY_STEP = 0.1;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image_load_failed")); };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

/** 업로드 전 이미지 리사이즈·압축. 900KB 이하로 줄인 뒤 반환한다. */
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
  let quality = INITIAL_QUALITY;
  let blob: Blob | null = null;

  while (quality >= MIN_QUALITY) {
    blob = await canvasToBlob(canvas, outputType, quality);
    if (!blob || blob.size <= MAX_UPLOAD_BYTES) break;
    quality -= QUALITY_STEP;
  }

  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "") || "upload";
  const ext = outputType === "image/png" ? ".png" : ".jpg";
  return new File([blob], `${baseName}${ext}`, { type: outputType });
}
