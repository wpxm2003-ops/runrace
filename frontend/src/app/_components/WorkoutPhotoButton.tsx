"use client";

import { useRef, useState } from "react";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import { Button } from "@/app/_components/ui/Button";
import { updateWorkoutImage, uploadImage, patchWorkoutDetailImage } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { useNativeBack } from "@/lib/useNativeBack";

/**
 * 기록 카드의 "사진으로 남기기" 버튼.
 * - 저장된 사진이 없으면: 사진 선택창 → 업로드 후 첨부
 * - 저장된 사진이 있으면: 큰 뷰어로 보기(교체·삭제는 뷰어 안에서)
 */
export function WorkoutPhotoButton({
  workoutId,
  imageUrl,
  user,
  className = "",
}: {
  workoutId: number;
  imageUrl: string | null;
  user: User;
  className?: string;
}) {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  // 뷰어가 열려 있으면 Android 백버튼/ESC는 뷰어만 닫는다.
  useNativeBack(() => setViewerOpen(false), viewerOpen);

  function pickFile() {
    fileRef.current?.click();
  }

  function onTrigger() {
    if (busy) return;
    if (imageUrl) setViewerOpen(true);
    else pickFile();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    setViewerOpen(false); // 교체 시 뷰어 닫고 메인 버튼에 진행 표시
    setBusy(true);
    try {
      const url = await uploadImage(file, user);
      await updateWorkoutImage(workoutId, url, user);
      patchWorkoutDetailImage(workoutId, user.uid, url);
      toast.success(t.photo_saved);
    } catch (err) {
      toast.error(String(err).includes("upload_too_large") ? t.upload_too_large : t.error_occurred);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await updateWorkoutImage(workoutId, null, user);
      patchWorkoutDetailImage(workoutId, user.uid, null);
      setViewerOpen(false);
      toast.success(t.photo_deleted);
    } catch {
      toast.error(t.error_occurred);
    } finally {
      setBusy(false);
    }
  }

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
      >
        {busy ? t.photo_busy : imageUrl ? `🖼️ ${t.photo_view_btn}` : `📷 ${t.photo_save_btn}`}
      </Button>

      {viewerOpen && imageUrl ? (
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
              ✕
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
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
              disabled={busy}
              onClick={pickFile}
              className="h-11 flex-1 bg-white"
            >
              {t.indoor_field_image_change}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
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
