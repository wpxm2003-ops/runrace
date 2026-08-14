"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { updateWorkoutImage, uploadImage, patchWorkoutDetailImage, mapErrorMessage } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import type { Translations } from "@/lib/i18n/translations";
import { RoutePath, type PathPoint } from "@/lib/routePath";
import { useNativeBack } from "@/lib/useNativeBack";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance, formatPace, type DistanceUnit } from "@/lib/units";
import { formatClock } from "@/lib/workoutTrack";
import { CARD_W, captureCardBlob, saveBlobLocally } from "@/lib/storyCard";

/**
 * 운동 사진 등록 에디터 — 사진을 고른 뒤 "기록 삽입"을 켜면 거리·페이스·시간(+경로)을
 * 스트라바처럼 사진 위에 얹어 드래그(위치)·핀치/슬라이더(크기)로 조정할 수 있다.
 * [등록]은 결과물을 S3에 올려 운동 사진으로 저장하고, [다운로드]는 기기에 저장한다.
 *
 * 사진 원본은 dataURL로만 미리보기에 쓴다(objectURL 대신인 이유: 캡처 라이브러리의
 * cacheBust가 URL에 쿼리를 붙이는데 blob: URL은 쿼리가 붙으면 fetch가 깨질 수 있다).
 */

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;

/** 기록 배치 — 세로(스택) / 가로(한 줄). 사진 자체는 원본 비율 그대로 두고 배치만 바꾼다. */
type OverlayLayout = "vertical" | "horizontal";

/** 배치 전환 시 기본 위치 — 세로는 좌상단, 가로는 하단 중앙이 사진을 덜 가린다. */
const LAYOUT_DEFAULT_POS: Record<OverlayLayout, { cx: number; cy: number }> = {
  vertical: { cx: 0.28, cy: 0.3 },
  horizontal: { cx: 0.5, cy: 0.82 },
};

/** 캡처 캔버스 상한(긴 변) — 원본이 더 크면 축소, 작으면 원본 크기 유지(품질 보존). */
const MAX_CANVAS_LONG_SIDE = 1920;

/** 사진 원본 비율을 유지한 채 긴 변을 상한에 맞춘 캡처 캔버스 크기. */
function canvasSizeFor(imageWidth: number, imageHeight: number): { width: number; height: number } {
  const long = Math.max(imageWidth, imageHeight);
  const shrink = Math.min(1, MAX_CANVAS_LONG_SIDE / Math.max(1, long));
  return {
    width: Math.max(1, Math.round(imageWidth * shrink)),
    height: Math.max(1, Math.round(imageHeight * shrink)),
  };
}

/** 경로 오버레이의 디자인 좌표계(1080 기준) — 미리보기/캡처가 같은 값으로 정규화된다. */
const ROUTE_DESIGN = { width: 430, height: 260, padding: 16 } as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type OverlayStat = { label: string; value: string };

/** 에디터가 오버레이를 그리는 데 필요한 운동 데이터. */
export type WorkoutStatsData = {
  distanceM: number;
  durationSec: number;
  workoutType: "GPS" | "INDOOR";
  path: PathPoint[];
};

/**
 * 기록 오버레이 — 모든 치수를 1080(카드 짧은 변) 기준 디자인값 × (base/1080) × scale로 계산해
 * 미리보기(수백 px)와 캡처 캔버스가 정확히 같은 비율로 렌더된다.
 * base를 짧은 변으로 잡아 세로/가로 어느 카드에서도 오버레이 체감 크기가 같다.
 */
function StatsOverlay({
  base,
  cx,
  cy,
  scale,
  layout,
  stats,
  routePath,
}: {
  /** 렌더 대상 카드의 짧은 변 길이(px). */
  base: number;
  cx: number;
  cy: number;
  scale: number;
  /** 기록 배치 — vertical(스택) / horizontal(한 줄). */
  layout: OverlayLayout;
  stats: OverlayStat[];
  /** 경로 오버레이(선택) — GPS 기록 + "경로 표시" 켠 경우만. */
  routePath: PathPoint[] | null;
}) {
  const u = (base / CARD_W) * scale;
  const horizontal = layout === "horizontal";
  // 가로 배치는 세 값이 한 줄에 들어가야 해 글자를 한 단계 줄인다(긴 기록 잘림 방지).
  const labelSize = (horizontal ? 30 : 34) * u;
  const valueSize = (horizontal ? 68 : 88) * u;
  return (
    <div
      style={{
        position: "absolute",
        left: `${cx * 100}%`,
        top: `${cy * 100}%`,
        transform: "translate(-50%, -50%)",
        color: "#FFFFFF",
        fontFamily: FONT,
        textShadow: `0 ${2 * u}px ${16 * u}px rgba(0,0,0,0.65)`,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        display: horizontal ? "flex" : "block",
        flexDirection: "column",
        alignItems: horizontal ? "center" : undefined,
      }}
    >
      <div style={horizontal ? { display: "flex", gap: 52 * u, alignItems: "flex-start" } : undefined}>
        {stats.map(({ label, value }, index) => (
          <div key={label} style={{ marginTop: horizontal || index === 0 ? 0 : 34 * u }}>
            <div style={{ fontSize: labelSize, fontWeight: 500, opacity: 0.92, letterSpacing: 1 * u }}>
              {label}
            </div>
            <div style={{ fontSize: valueSize, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 * u }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      {routePath && routePath.length > 1 ? (
        <div
          style={{
            width: ROUTE_DESIGN.width * u,
            height: ROUTE_DESIGN.height * u,
            marginTop: 36 * u,
            marginLeft: horizontal ? 0 : -ROUTE_DESIGN.padding * u,
            filter: `drop-shadow(0 ${2 * u}px ${10 * u}px rgba(0,0,0,0.5))`,
          }}
        >
          <RoutePath
            path={routePath}
            width={ROUTE_DESIGN.width}
            height={ROUTE_DESIGN.height}
            padding={ROUTE_DESIGN.padding}
            strokeWidths={[20, 10, 4.5]}
            startRadius={7}
            endRadius={8}
            endStrokeWidth={4}
            svgProps={{ width: "100%", height: "100%", "aria-hidden": true }}
          />
        </div>
      ) : null}
      {/* 브랜드 — 기존 스토리 카드 푸터와 동일 아이덴티티(그린 점 + 도메인) */}
      <div style={{ marginTop: 40 * u, display: "flex", alignItems: "center", gap: 12 * u }}>
        <div style={{ width: 14 * u, height: 14 * u, borderRadius: "50%", background: "#34D399" }} />
        <div style={{ fontSize: 34 * u, fontWeight: 700, opacity: 0.95 }}>runrace.co.kr</div>
      </div>
    </div>
  );
}

/**
 * 사진 등록 에디터 본체. WorkoutPhotoButton이 사진 선택 직후 연다.
 * onUploaded는 S3 업로드+운동 연결까지 끝난 뒤 최종 URL로 호출된다.
 */
export function WorkoutPhotoEditor({
  file,
  dataUrl,
  imageWidth,
  imageHeight,
  workoutId,
  user,
  workout,
  onUploaded,
  onClose,
}: {
  file: File;
  dataUrl: string;
  /** 사진 원본 크기 — 캔버스·미리보기가 이 비율을 그대로 따른다(크롭 없음). */
  imageWidth: number;
  imageHeight: number;
  workoutId: number;
  user: User;
  workout: WorkoutStatsData;
  onUploaded: (url: string) => void;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const { unit } = useUnit();

  const [busy, setBusy] = useState<"upload" | "download" | null>(null);
  // 업로드가 진행 중일 때 닫으면 업로드는 서버에서 끝까지 진행되는데 사용자는 취소됐다고
  // 생각하게 된다 — busy 동안은 백버튼/✕ 닫기를 막는다(버튼들도 이미 disabled).
  useNativeBack(() => {
    if (!busy) onClose();
  });

  const [insertStats, setInsertStats] = useState(false);
  const [showRoute, setShowRoute] = useState(true);
  const [layout, setLayout] = useState<OverlayLayout>("vertical");
  // 오버레이 중심(카드 분율)·배율 — 미리보기와 캡처 DOM이 같은 값을 공유한다.
  const [cx, setCx] = useState(LAYOUT_DEFAULT_POS.vertical.cx);
  const [cy, setCy] = useState(LAYOUT_DEFAULT_POS.vertical.cy);
  const [scale, setScale] = useState(1);

  const previewRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(0);

  const canRoute = workout.workoutType === "GPS" && workout.path.length > 1;
  const routePath = insertStats && showRoute && canRoute ? workout.path : null;
  const stats = buildStats(workout.distanceM, workout.durationSec, unit, t);

  // 캔버스는 사진 원본 비율 그대로(긴 변만 상한). 오버레이 기준(base)은 항상 짧은 변.
  const canvas = canvasSizeFor(imageWidth, imageHeight);
  const aspect = canvas.width / canvas.height;
  const previewBase = previewW * (Math.min(canvas.width, canvas.height) / canvas.width);

  /** 배치 전환 — 위치를 배치별 기본값으로 되돌린다(가로 줄이 좌측 밖으로 잘리는 것 방지). */
  function onSelectLayout(next: OverlayLayout) {
    setLayout(next);
    setCx(LAYOUT_DEFAULT_POS[next].cx);
    setCy(LAYOUT_DEFAULT_POS[next].cy);
  }

  // 미리보기 실제 폭 측정 — 오버레이 치수를 캡처 캔버스와 같은 비율로 렌더하기 위함.
  useLayoutEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const update = () => setPreviewW(node.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [insertStats]);

  // 드래그(1포인터)·핀치(2포인터) — 포인터별 마지막 좌표를 들고 이동량/거리비를 적용한다.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());

  // 제스처 도중 기록 삽입을 끄면 미리보기 표면이 통째로 갈아끼워져 pointerup을 놓친다.
  // 남은 유령 포인터가 다음 한 손가락 드래그를 핀치로 오인하게 하므로 표면이 사라질 때 비운다.
  useEffect(() => {
    if (!insertStats) pointersRef.current.clear();
  }, [insertStats]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!insertStats) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const pointers = pointersRef.current;
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;

    if (pointers.size === 1) {
      setCx((v) => clamp(v + (e.clientX - prev.x) / rect.width, 0.05, 0.95));
      setCy((v) => clamp(v + (e.clientY - prev.y) / rect.height, 0.05, 0.95));
    } else if (pointers.size === 2) {
      // 나머지 한 손가락과의 거리 변화율만큼 배율을 곱한다(핀치 줌).
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const dPrev = Math.hypot(prev.x - other.x, prev.y - other.y);
        const dCurr = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (dPrev > 0) setScale((v) => clamp(v * (dCurr / dPrev), MIN_SCALE, MAX_SCALE));
      }
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
  }

  /** 기록 삽입 시 캡처 결과(JPEG) — 등록·다운로드 공용. */
  async function captureJpeg(): Promise<Blob> {
    const node = captureRef.current;
    if (!node) throw new Error("no capture node");
    return captureCardBlob(node, canvas, "#000000", "image/jpeg");
  }

  async function onUpload() {
    if (busy) return;
    setBusy("upload");
    try {
      let uploadFile = file;
      if (insertStats) {
        const blob = await captureJpeg();
        // 캡처 결과는 이미 JPEG 최종본 — 클라이언트 재압축을 건너뛴다.
        uploadFile = new File([blob], "runrace-photo.jpg", { type: "image/jpeg" });
      }
      const url = await uploadImage(uploadFile, user, { precompressed: insertStats });
      await updateWorkoutImage(workoutId, url, user);
      patchWorkoutDetailImage(workoutId, user.uid, url);
      if (insertStats) {
        void track("photo_card_saved", { workoutType: workout.workoutType, layout, action: "upload" });
      }
      toast.success(t.photo_saved);
      onUploaded(url);
      onClose();
    } catch (err) {
      toast.error(
        mapErrorMessage(err, [{ codes: ["upload_too_large"], message: t.upload_too_large }], () => t.photo_card_error),
      );
    } finally {
      setBusy(null);
    }
  }

  async function onDownload() {
    if (busy) return;
    setBusy("download");
    try {
      const blob = await captureJpeg();
      const result = await saveBlobLocally(blob, "runrace-photo", ".jpg");
      if (result === "saved") {
        void track("photo_card_saved", { workoutType: workout.workoutType, layout, action: "download" });
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") {
        toast.error(t.photo_card_error);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="text-sm font-semibold text-white">{t.photo_save_btn}</div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy != null}
          aria-label={t.cancel}
          className="-mr-1 rounded-lg p-1 text-zinc-400 hover:text-white disabled:opacity-40"
        >
          ✕
        </button>
      </div>

      {/* 미리보기 — 크롭 없이 사진 원본 비율 그대로. 기록 삽입 시 드래그/핀치 표면이 된다 */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-5">
        {insertStats ? (
          <div
            ref={previewRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            className="relative touch-none select-none overflow-hidden rounded-xl bg-zinc-900"
            style={{
              aspectRatio: `${canvas.width} / ${canvas.height}`,
              width: `min(100%, calc((100dvh - 330px) * ${aspect}))`,
            }}
          >
            <img
              src={dataUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {previewW > 0 ? (
              <StatsOverlay
                base={previewBase}
                cx={cx}
                cy={cy}
                scale={scale}
                layout={layout}
                stats={stats}
                routePath={routePath}
              />
            ) : null}
          </div>
        ) : (
          <img src={dataUrl} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
        )}
      </div>

      {/* 푸터 — 기록 삽입 토글 · (켜면) 경로/방향/크기 · 등록/다운로드 */}
      <div className="px-5 pb-8 pt-4">
        <div className="flex items-center justify-center gap-5">
          <label className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={insertStats}
              onChange={(e) => setInsertStats(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-500 accent-brand"
            />
            {t.photo_card_insert_stats}
          </label>
          {insertStats && canRoute ? (
            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                checked={showRoute}
                onChange={(e) => setShowRoute(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-500 accent-brand"
              />
              {t.photo_card_show_route}
            </label>
          ) : null}
        </div>

        {insertStats ? (
          <>
            <div className="mx-auto mt-3 flex w-fit rounded-lg bg-zinc-800 p-1">
              {(["vertical", "horizontal"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => onSelectLayout(l)}
                  className={`rounded-md px-4 py-1.5 text-xs font-medium ${
                    layout === l ? "bg-white text-zinc-900" : "text-zinc-400"
                  }`}
                >
                  {l === "vertical" ? t.photo_card_layout_vertical : t.photo_card_layout_horizontal}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-zinc-400">{t.photo_card_hint}</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xs text-zinc-400">{t.photo_card_size}</span>
              <input
                type="range"
                min={MIN_SCALE}
                max={MAX_SCALE}
                step={0.05}
                value={scale}
                aria-label={t.photo_card_size}
                onChange={(e) => setScale(Number(e.target.value))}
                className="h-1 flex-1 accent-brand"
              />
            </div>
          </>
        ) : null}

        <div className="mt-4 flex gap-2">
          {insertStats ? (
            <button
              type="button"
              onClick={() => void onDownload()}
              disabled={busy != null}
              className="h-12 flex-1 rounded-xl border border-zinc-600 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === "download" ? t.photo_card_busy : t.photo_card_download}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void onUpload()}
            disabled={busy != null}
            className="h-12 flex-1 rounded-xl bg-white text-sm font-semibold text-zinc-900 disabled:opacity-50"
          >
            {busy === "upload" ? t.photo_card_busy : t.photo_save_btn}
          </button>
        </div>
      </div>

      {/* 캡처 전용 오프스크린 카드 — 미리보기와 같은 분율·배율로 렌더(짧은 변 1080 고정) */}
      {insertStats ? (
        <div
          aria-hidden="true"
          style={{ position: "fixed", left: "-99999px", top: 0, pointerEvents: "none" }}
        >
          <div
            ref={captureRef}
            style={{
              width: canvas.width,
              height: canvas.height,
              position: "relative",
              overflow: "hidden",
              background: "#000000",
            }}
          >
            <img
              src={dataUrl}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            <StatsOverlay
              base={Math.min(canvas.width, canvas.height)}
              cx={cx}
              cy={cy}
              scale={scale}
              layout={layout}
              stats={stats}
              routePath={routePath}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildStats(
  distanceM: number,
  durationSec: number,
  unit: DistanceUnit,
  t: Translations,
): OverlayStat[] {
  return [
    { label: t.stat_distance, value: formatDistance(distanceM, unit) },
    { label: t.stat_pace, value: formatPace(distanceM, durationSec, unit) },
    { label: t.stat_time, value: formatClock(durationSec) },
  ];
}
