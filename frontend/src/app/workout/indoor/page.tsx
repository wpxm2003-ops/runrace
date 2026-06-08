"use client";

import { useRef, useState } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { createIndoorRun, uploadImage } from "@/lib/api";
import { compressImageForUpload } from "@/lib/compressImage";
import { readPhotoTakenAt, workoutStartedAtFromPhotoEnd } from "@/lib/imageExif";
import { formatDateTimeMinute } from "@/lib/format";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { nativeNavigate } from "@/lib/nativeNav";

type FieldErrors = {
  distance?: string;
  duration?: string;
  image?: string;
};

export default function IndoorRunPage() {
  const { user, loading } = useRequireAuth("/workout/indoor");
  const { t } = useLocale();

  const [distanceKm, setDistanceKm] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imagePreparing, setImagePreparing] = useState(false);
  const [photoTakenAt, setPhotoTakenAt] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFieldErrors((prev) => ({ ...prev, image: undefined }));
    setImagePreview(URL.createObjectURL(file));
    setImageFile(null);
    setPhotoTakenAt(null);
    setImagePreparing(true);
    try {
      const [compressed, takenAt] = await Promise.all([
        compressImageForUpload(file),
        readPhotoTakenAt(file),
      ]);
      setImageFile(compressed);
      setPhotoTakenAt(takenAt);
    } catch {
      setImageFile(file);
    } finally {
      setImagePreparing(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const errors: FieldErrors = {};

    const distM = Math.round(parseFloat(distanceKm) * 1000);
    if (!distanceKm || isNaN(distM) || distM <= 0) {
      errors.distance = t.indoor_err_distance;
    }

    const h = parseInt(hours || "0", 10) || 0;
    const m = parseInt(minutes || "0", 10) || 0;
    const s = parseInt(seconds || "0", 10) || 0;
    const durationSec = h * 3600 + m * 60 + s;
    if (durationSec < 1) {
      errors.duration = t.indoor_err_duration;
    }

    if (!imageFile || imagePreparing) {
      errors.image = imagePreparing ? t.indoor_err_image_preparing : t.indoor_err_image;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      const imageUrl = await uploadImage(imageFile!, user, { precompressed: true });
      const startedAt = photoTakenAt
        ? workoutStartedAtFromPhotoEnd(photoTakenAt, durationSec)
        : new Date().toISOString();

      const res = await createIndoorRun(
        {
          distanceM: distM,
          durationSec,
          startedAt,
          imageUrl,
        },
        user,
      );
      nativeNavigate(`/workouts/${res.id}`);
    } catch (e) {
      const msg =
        e instanceof Error && e.message === "upload_too_large"
          ? t.upload_too_large
          : String(e);
      setSubmitError(msg);
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
        {t.loading}
      </div>
    );
  }

  return (
    <PageLayout
      title={t.indoor_title}
      actions={
        <a className="text-sm text-zinc-600 hover:underline" href="/">
          홈
        </a>
      }
    >
      {submitError ? <Alert className="mb-4">{submitError}</Alert> : null}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {/* 이미지 — 선택 시 압축이 시작되므로 맨 위 */}
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
                fieldErrors.image
                  ? "border-red-400 bg-red-50 text-red-400"
                  : "border-zinc-300 bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              {t.indoor_field_image_select}
            </button>
          )}
          {imagePreparing ? (
            <p className="mt-1 text-xs text-zinc-500">{t.indoor_image_preparing}</p>
          ) : photoTakenAt ? (
            <p className="mt-1 text-xs text-emerald-700">
              {t.indoor_photo_time_hint(formatDateTimeMinute(photoTakenAt.toISOString()))}
            </p>
          ) : null}
          {fieldErrors.image ? (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.image}</p>
          ) : null}
        </div>

        {/* 거리 */}
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            {t.indoor_field_distance}
            <span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder={t.indoor_field_distance_placeholder}
            value={distanceKm}
            onKeyDown={(e) => {
              // 소수점 둘째자리 초과 입력 차단
              const val = distanceKm;
              const dot = val.indexOf(".");
              if (dot !== -1 && val.length - dot > 2 && e.key !== "Backspace" && e.key !== "Delete" && e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Tab") {
                e.preventDefault();
              }
            }}
            onChange={(e) => {
              const val = e.target.value;
              // 소수점 둘째자리까지만 허용
              if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
                setDistanceKm(val);
              }
              setFieldErrors((prev) => ({ ...prev, distance: undefined }));
            }}
            className={`mt-1 block w-full rounded-xl border px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:outline-none ${
              fieldErrors.distance
                ? "border-red-400 bg-red-50 focus:border-red-400"
                : "border-zinc-200 bg-white focus:border-zinc-400"
            }`}
          />
          {fieldErrors.distance ? (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.distance}</p>
          ) : null}
        </div>

        {/* 운동 시간 */}
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            운동 시간
            <span className="ml-0.5 text-red-500">*</span>
          </label>
          <div className="mt-1 flex gap-2">
            <div className="flex flex-1 items-center gap-1">
              <input
                type="number"
                min="0"
                placeholder="0"
                value={hours}
                onChange={(e) => {
                  setHours(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, duration: undefined }));
                }}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${
                  fieldErrors.duration
                    ? "border-red-400 bg-red-50"
                    : "border-zinc-200 bg-white focus:border-zinc-400"
                }`}
              />
              <span className="shrink-0 text-sm text-zinc-500">{t.indoor_field_duration_h}</span>
            </div>
            <div className="flex flex-1 items-center gap-1">
              <input
                type="number"
                min="0"
                max="59"
                placeholder="0"
                value={minutes}
                onChange={(e) => {
                  setMinutes(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, duration: undefined }));
                }}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${
                  fieldErrors.duration
                    ? "border-red-400 bg-red-50"
                    : "border-zinc-200 bg-white focus:border-zinc-400"
                }`}
              />
              <span className="shrink-0 text-sm text-zinc-500">{t.indoor_field_duration_m}</span>
            </div>
            <div className="flex flex-1 items-center gap-1">
              <input
                type="number"
                min="0"
                max="59"
                placeholder="0"
                value={seconds}
                onChange={(e) => {
                  setSeconds(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, duration: undefined }));
                }}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${
                  fieldErrors.duration
                    ? "border-red-400 bg-red-50"
                    : "border-zinc-200 bg-white focus:border-zinc-400"
                }`}
              />
              <span className="shrink-0 text-sm text-zinc-500">{t.indoor_field_duration_s}</span>
            </div>
          </div>
          {fieldErrors.duration ? (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.duration}</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={submitting || imagePreparing || !imageFile}
          className="h-12 w-full rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300"
        >
          {imagePreparing ? t.indoor_image_preparing : submitting ? t.indoor_submitting : t.indoor_submit}
        </button>
      </form>
    </PageLayout>
  );
}
