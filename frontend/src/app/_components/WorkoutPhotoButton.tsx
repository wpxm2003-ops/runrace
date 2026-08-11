"use client";

import { useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import { Button } from "@/app/_components/ui/Button";
import { updateWorkoutImage, uploadImage, patchWorkoutDetailImage, mapErrorMessage } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { useNativeBack } from "@/lib/useNativeBack";
import { saveBlobLocally } from "@/lib/storyCard";
import {
  WorkoutPhotoEditor,
  readAsDataURL,
  type WorkoutStatsData,
} from "@/app/workouts/_components/PhotoStatsCard";

export function WorkoutPhotoButton({
  workoutId,
  imageUrl,
  user,
  statsData,
  className = "",
  children,
  ariaLabel,
}: {
  workoutId: number;
  imageUrl: string | null;
  user: User;
  /** 넘기면 사진 선택 후 기록 삽입 에디터를 연다(운동 상세). 없으면 즉시 업로드(기존 동작). */
  statsData?: WorkoutStatsData;
  className?: string;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(imageUrl);
  const [editing, setEditing] = useState<
    { file: File; dataUrl: string; width: number; height: number } | null
  >(null);

  useNativeBack(() => setViewerOpen(false), viewerOpen);

  function pickFile() {
    fileRef.current?.click();
  }

  function onTrigger() {
    if (busy) return;
    if (url) setViewerOpen(true);
    else pickFile();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setViewerOpen(false);

    // 운동 상세: 에디터를 열어 기록 삽입 여부를 고르게 한다. 업로드는 에디터의 [등록]이 수행.
    if (statsData) {
      try {
        const dataUrl = await readAsDataURL(file);
        // 디코드 가능한지 미리 확인 — 깨진/미지원 포맷이면 에디터를 열지 않는다.
        // 원본 크기도 여기서 확보한다(캔버스가 사진 비율을 그대로 따라가므로).
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        setEditing({ file, dataUrl, width: image.naturalWidth, height: image.naturalHeight });
      } catch {
        toast.error(t.photo_card_load_error);
      }
      return;
    }

    setBusy(true);
    try {
      const newUrl = await uploadImage(file, user);
      await updateWorkoutImage(workoutId, newUrl, user);
      setUrl(newUrl);
      patchWorkoutDetailImage(workoutId, user.uid, newUrl);
      toast.success(t.photo_saved);
    } catch (err) {
      toast.error(mapErrorMessage(err, [{ codes: ["upload_too_large"], message: t.upload_too_large }], () => t.error_occurred));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await updateWorkoutImage(workoutId, null, user);
      setUrl(null);
      patchWorkoutDetailImage(workoutId, user.uid, null);
      setViewerOpen(false);
      toast.success(t.photo_deleted);
    } catch {
      toast.error(t.error_occurred);
    } finally {
      setBusy(false);
    }
  }

  async function onDownload() {
    if (!url || busy || downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`image_download_${response.status}`);
      const blob = await response.blob();
      // 확장자는 실제 형식에서 — 전부 .jpg로 저장하면 PNG/WebP 원본이 확장자와 어긋난다.
      const ext =
        blob.type === "image/png" ? ".png" : blob.type === "image/webp" ? ".webp" : ".jpg";
      const result = await saveBlobLocally(blob, `runrace-workout-${workoutId}`, ext);
      if (result === "saved") toast.success(t.photo_saved);
    } catch {
      toast.error(t.error_occurred);
    } finally {
      setDownloading(false);
    }
  }

  const buttonLabel = busy ? t.photo_busy : url ? t.photo_view_btn : t.photo_save_btn;
  const accessibleLabel = ariaLabel ?? buttonLabel;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileSelected}
      />
      <Button
        variant="secondary"
        disabled={busy}
        onClick={onTrigger}
        className={className}
        aria-label={accessibleLabel}
        title={accessibleLabel}
      >
        {children ?? buttonLabel}
      </Button>

      {editing && statsData ? (
        <WorkoutPhotoEditor
          file={editing.file}
          dataUrl={editing.dataUrl}
          imageWidth={editing.width}
          imageHeight={editing.height}
          workoutId={workoutId}
          user={user}
          workout={statsData}
          onUploaded={(newUrl) => setUrl(newUrl)}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {viewerOpen && url ? (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-black/90"
          role="dialog"
          aria-modal="true"
          onClick={() => setViewerOpen(false)}
        >
          <div className="flex justify-end p-4">
            <button
              type="button"
              onClick={() => setViewerOpen(false)}
              aria-label={t.cancel}
              className="rounded-lg p-2 text-2xl leading-none text-white/80 hover:text-white"
            >
              x
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-4">
            <img
              src={url}
              alt=""
              className="max-h-full max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div
            className="flex gap-2 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="secondary"
              disabled={busy || downloading}
              onClick={pickFile}
              className="h-11 flex-1 bg-white"
            >
              {t.indoor_field_image_change}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || downloading}
              onClick={onDownload}
              className="h-11 flex-1 bg-white"
            >
              {downloading ? t.photo_card_busy : t.photo_card_download}
            </Button>
            <Button
              variant="destructive"
              disabled={busy || downloading}
              onClick={onDelete}
              className="h-11 flex-1 bg-white"
            >
              {t.delete}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
