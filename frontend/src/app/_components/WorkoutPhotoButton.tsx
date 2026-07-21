"use client";

import { useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import { Button } from "@/app/_components/ui/Button";
import { updateWorkoutImage, uploadImage, patchWorkoutDetailImage } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { useNativeBack } from "@/lib/useNativeBack";

export function WorkoutPhotoButton({
  workoutId,
  imageUrl,
  user,
  className = "",
  children,
  ariaLabel,
}: {
  workoutId: number;
  imageUrl: string | null;
  user: User;
  className?: string;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(imageUrl);

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
    setBusy(true);
    try {
      const newUrl = await uploadImage(file, user);
      await updateWorkoutImage(workoutId, newUrl, user);
      setUrl(newUrl);
      patchWorkoutDetailImage(workoutId, user.uid, newUrl);
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
