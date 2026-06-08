import { Capacitor } from "@capacitor/core";

/**
 * 운동/레이스 기록을 공유용 이미지 카드(PNG)로 렌더링하고,
 * 네이티브(Capacitor Share) 또는 웹(Web Share API)으로 내보낸다.
 *
 * 경로는 지도 타일이 아니라 path 좌표를 canvas에 직접 그린다.
 * → 외부 이미지 CORS 문제가 없고 정적 export 환경에서도 동작한다.
 */

type LatLng = { lat: number; lng: number };

const SIZE = 1080;
const PAD = 72;
const ACCENT = "#34d399"; // emerald-400
const BG_TOP = "#0a0a0b";
const BG_BOTTOM = "#27272a"; // zinc-800

export type WorkoutCardData = {
  nickname?: string | null;
  distanceKm: string; // "12.34"
  durationLabel: string; // "1:02:03"
  paceLabel: string; // "5'30\"/km"
  calories: number;
  dateLabel: string;
  path: LatLng[];
};

export type RaceCardData = {
  title: string;
  goalKm: number;
  members: { nickname: string | null; totalKm: string; progressPercent: number }[];
  winnerNickname?: string | null;
  dateLabel: string;
};

function hostLabel(): string {
  if (typeof window === "undefined") return "RunRace";
  const h = window.location.host;
  return h && !h.startsWith("localhost") && !/^\d/.test(h) ? h : "runrace";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function newCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
  grad.addColorStop(0, BG_TOP);
  grad.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);
  return { canvas, ctx };
}

function drawHeader(ctx: CanvasRenderingContext2D) {
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 56px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("RunRace", PAD, 110);

  ctx.fillStyle = "#a1a1aa"; // zinc-400
  ctx.font = "400 30px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(hostLabel(), SIZE - PAD, 110);
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + "…";
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  path: LatLng[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  // 패널 배경
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, x, y, w, h, 36);
  ctx.fill();

  if (path.length < 2) {
    ctx.fillStyle = "#71717a";
    ctx.font = "400 36px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("경로 없음", x + w / 2, y + h / 2);
    return;
  }

  const inset = 56;
  const lats = path.map((p) => p.lat);
  const lngs = path.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * cos, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const availW = w - inset * 2;
  const availH = h - inset * 2;
  const scale = Math.min(availW / spanX, availH / spanY);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offX = x + inset + (availW - drawW) / 2;
  const offY = y + inset + (availH - drawH) / 2;

  const pts = path.map((p) => ({
    x: offX + (p.lng - minLng) * cos * scale,
    y: offY + (maxLat - p.lat) * scale,
  }));

  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();

  // 시작/종료 점
  const first = pts[0];
  const last = pts[pts.length - 1];
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(first.x, first.y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 14, 0, Math.PI * 2);
  ctx.fill();
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas_to_blob_failed"))),
      "image/png",
    );
  });
}

export async function buildWorkoutCard(data: WorkoutCardData): Promise<Blob> {
  const { ctx, canvas } = newCanvas();
  drawHeader(ctx);
  drawRoute(ctx, data.path, PAD, 150, SIZE - PAD * 2, 470);

  // 큰 거리 숫자
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 150px sans-serif";
  ctx.fillText(data.distanceKm, PAD, 770);
  const numW = ctx.measureText(data.distanceKm).width;
  ctx.fillStyle = "#a1a1aa";
  ctx.font = "600 56px sans-serif";
  ctx.fillText("km", PAD + numW + 20, 770);

  // 하단 통계 3열
  const cols = [
    { label: "시간", value: data.durationLabel },
    { label: "페이스", value: data.paceLabel },
    { label: "칼로리", value: `${data.calories}` },
  ];
  const colW = (SIZE - PAD * 2) / 3;
  cols.forEach((c, i) => {
    const cx = PAD + colW * i;
    ctx.textAlign = "left";
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "400 32px sans-serif";
    ctx.fillText(c.label, cx, 890);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 52px sans-serif";
    ctx.fillText(truncate(ctx, c.value, colW - 20), cx, 950);
  });

  // 푸터
  ctx.fillStyle = "#71717a";
  ctx.font = "400 34px sans-serif";
  ctx.textAlign = "left";
  const footer = [data.nickname, data.dateLabel].filter(Boolean).join("  ·  ");
  ctx.fillText(footer, PAD, 1020);

  return canvasToBlob(canvas);
}

export async function buildRaceCard(data: RaceCardData): Promise<Blob> {
  const { ctx, canvas } = newCanvas();
  drawHeader(ctx);

  // 제목
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 64px sans-serif";
  ctx.fillText(truncate(ctx, data.title, SIZE - PAD * 2), PAD, 250);

  ctx.fillStyle = "#a1a1aa";
  ctx.font = "400 40px sans-serif";
  ctx.fillText(`목표 ${data.goalKm}km`, PAD, 312);

  let y = 400;
  if (data.winnerNickname) {
    ctx.fillStyle = "#fbbf24"; // amber-400
    ctx.font = "600 42px sans-serif";
    ctx.fillText(`🏆 ${data.winnerNickname} 우승!`, PAD, y);
    y += 70;
  }

  // 순위 (상위 5명)
  const top = data.members.slice(0, 5);
  const rowH = (980 - y) / Math.max(top.length, 1);
  const barH = 16;
  const innerW = SIZE - PAD * 2;
  top.forEach((m, i) => {
    const ry = y + rowH * i;
    ctx.textAlign = "left";
    ctx.fillStyle = ACCENT;
    ctx.font = "700 44px sans-serif";
    ctx.fillText(`${i + 1}`, PAD, ry + 44);

    ctx.fillStyle = "#ffffff";
    ctx.font = "600 44px sans-serif";
    ctx.fillText(truncate(ctx, m.nickname ?? "(이름 없음)", innerW - 320), PAD + 70, ry + 44);

    ctx.textAlign = "right";
    ctx.fillStyle = "#d4d4d8";
    ctx.font = "600 40px sans-serif";
    ctx.fillText(`${m.totalKm} km`, SIZE - PAD, ry + 44);

    // 진행 바
    const pct = Math.min(100, Math.max(0, m.progressPercent)) / 100;
    const by = ry + 70;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    roundRect(ctx, PAD, by, innerW, barH, barH / 2);
    ctx.fill();
    if (pct > 0) {
      ctx.fillStyle = ACCENT;
      roundRect(ctx, PAD, by, Math.max(innerW * pct, barH), barH, barH / 2);
      ctx.fill();
    }
  });

  // 푸터
  ctx.fillStyle = "#71717a";
  ctx.font = "400 34px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(data.dateLabel, PAD, 1030);

  return canvasToBlob(canvas);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = String(reader.result);
      resolve(r.slice(r.indexOf(",") + 1)); // "data:image/png;base64," 제거
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * URL 링크를 공유한다.
 * - 네이티브 / Web Share API 지원 환경: 시스템 공유 시트
 * - 미지원 환경: 클립보드 복사 후 'copied' 반환
 */
export async function shareLink(
  url: string,
  title: string,
): Promise<"shared" | "copied"> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, url });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({ title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return "shared";
    throw e;
  }
}

/** 생성한 이미지 Blob을 네이티브/웹 환경에 맞게 공유한다. 사용자가 취소하면 조용히 무시. */
export async function shareImageBlob(
  blob: Blob,
  filename: string,
  text: string,
  url?: string,
): Promise<void> {
  try {
    const shareText = url ? `${text}\n${url}` : text;

    if (Capacitor.isNativePlatform()) {
      const base64 = await blobToBase64(blob);
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const written = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({ text: shareText, files: [written.uri] });
      return;
    }

    const file = new File([blob], filename, { type: "image/png" });
    const nav = navigator as Navigator & {
      canShare?: (data?: unknown) => boolean;
    };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], text: shareText } as ShareData);
      return;
    }

    // 폴백: 이미지 다운로드
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch (e) {
    // 사용자가 공유 시트를 닫은 경우(AbortError 등)는 정상 흐름
    const name = (e as { name?: string })?.name;
    if (name === "AbortError") return;
    throw e;
  }
}
