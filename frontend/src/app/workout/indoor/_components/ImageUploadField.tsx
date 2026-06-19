"use client";

import { useRef, useState } from "react";
import { compressImageForUpload } from "@/lib/compressImage";
import { readPhotoTakenAt } from "@/lib/imageExif";
import { formatDateTimeMinute } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

export type ImageFieldState = {
  file: File | null;
  takenAt: Date | null;
  preparing: boolean;
};

type Props = {
  error?: string;
  onChange: (state: ImageFieldState) => void;
};

export function ImageUploadField({ error, onChange }: Props) {
  const { t, locale } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [photoTakenAt, setPhotoTakenAt] = useState<Date | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setPhotoTakenAt(null);
    setPreparing(true);
    onChange({ file: null, takenAt: null, preparing: true });
    try {
      const [compressed, takenAt] = await Promise.all([
        compressImageForUpload(file),
        readPhotoTakenAt(file),
      ]);
      setPhotoTakenAt(takenAt);
      setPreparing(false);
      onChange({ file: compressed, takenAt, preparing: false });
    } catch {
      setPreparing(false);
      onChange({ file, takenAt: null, preparing: false });
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">
        {t.indoor_field_image}
        <span className="ml-0.5 text-red-500">*</span>
      </label>
      <p className="mt-0.5 text-xs text-zinc-500">{t.indoor_field_image_hint}</p>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        className="hidden"
      />
      {imagePreview ? (
        <div className="mt-2">
          <img
            src={imagePreview}
            alt="미리보기"
            className="h-40 w-full rounded-2xl object-cover"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 text-sm text-zinc-500 hover:underline"
          >
            {t.indoor_field_image_change}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`mt-2 flex h-36 w-full items-center justify-center rounded-2xl border border-dashed text-sm ${
            error
              ? "border-red-400 bg-red-50 text-red-400"
              : "border-zinc-300 bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
          }`}
        >
          {t.indoor_field_image_select}
        </button>
      )}
      {preparing ? (
        <p className="mt-1 text-xs text-zinc-500">{t.indoor_image_preparing}</p>
      ) : photoTakenAt ? (
        <p className="mt-1 text-xs text-emerald-700">
          {t.indoor_photo_time_hint(formatDateTimeMinute(photoTakenAt.toISOString(), locale))}
        </p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
