"use client";

import { useState } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { ImageUploadField, type ImageFieldState } from "@/app/workout/indoor/_components/ImageUploadField";
import { DurationField } from "@/app/workout/indoor/_components/DurationField";
import { createIndoorRun, uploadImage, mapErrorMessage } from "@/lib/api";
import { track, distanceBucket } from "@/lib/analytics";
import { withRetry } from "@/lib/retry";
import { workoutStartedAtFromPhotoEnd } from "@/lib/imageExif";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { metersFromInput } from "@/lib/units";
import { nativeNavigate } from "@/lib/nativeNav";

type FieldErrors = {
  distance?: string;
  duration?: string;
  image?: string;
};

export default function IndoorRunPage() {
  const { user, loading } = useRequireAuth("/workout/indoor");
  const { t } = useLocale();
  const { unit } = useUnit();

  const [distanceKm, setDistanceKm] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [imageState, setImageState] = useState<ImageFieldState>({ file: null, takenAt: null, preparing: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const errors: FieldErrors = {};

    const distM = metersFromInput(distanceKm, unit);
    if (!distanceKm || isNaN(distM) || distM <= 0) {
      errors.distance = t.indoor_err_distance;
    } else if (distM > 100_000) {
      errors.distance = t.indoor_err_distance_max;
    }

    const h = parseInt(hours || "0", 10) || 0;
    const m = parseInt(minutes || "0", 10) || 0;
    const s = parseInt(seconds || "0", 10) || 0;
    const durationSec = h * 3600 + m * 60 + s;
    if (durationSec < 1) {
      errors.duration = t.indoor_err_duration;
    } else if (m > 59 || s > 59 || durationSec > 86_400) {
      errors.duration = t.indoor_err_duration_range;
    }

    if (!imageState.file || imageState.preparing) {
      errors.image = imageState.preparing ? t.indoor_err_image_preparing : t.indoor_err_image;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      const imageUrl = await uploadImage(imageState.file!, user, { precompressed: true });
      const startedAt = imageState.takenAt
        ? workoutStartedAtFromPhotoEnd(imageState.takenAt, durationSec)
        : new Date().toISOString();

      // 1차 방어: 3초 간격 3회 자동 재시도 (서버 재시작·네트워크 깜빡임 흡수)
      const res = await withRetry(
        () =>
          createIndoorRun(
            { distanceM: distM, durationSec, startedAt, imageUrl },
            user,
          ),
        3,
        3000,
      );
      const distanceKm = distM / 1000;
      void track("record_saved", {
        distance_bucket: distanceBucket(distanceKm),
        type: "indoor",
      });
      nativeNavigate(`/workouts/${res.id}`);
    } catch (e) {
      // 2차 방어: 업로드 용량 초과는 전용 안내, 그 외엔 친절 안내(폼 그대로 → 다시 제출이 곧 재시도)
      const msg = mapErrorMessage(
        e,
        [{ codes: ["upload_too_large"], message: t.upload_too_large }],
        () => t.workout_save_failed,
      );
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
    <PageLayout title={t.indoor_title}>
      {submitError ? <Alert className="mb-4">{submitError}</Alert> : null}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <ImageUploadField
          error={fieldErrors.image}
          onChange={(state) => {
            setImageState(state);
            if (!state.preparing) setFieldErrors((prev) => ({ ...prev, image: undefined }));
          }}
        />

        {/* 거리 */}
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            {t.stat_distance} ({unit})
            <span className="ml-0.5 text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            placeholder={t.indoor_field_distance_placeholder}
            value={distanceKm}
            onChange={(e) => {
              const val = e.target.value;
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

        <DurationField
          hours={hours}
          minutes={minutes}
          seconds={seconds}
          error={fieldErrors.duration}
          onChange={(field, value) => {
            if (field === "hours") setHours(value);
            else if (field === "minutes") setMinutes(value);
            else setSeconds(value);
            setFieldErrors((prev) => ({ ...prev, duration: undefined }));
          }}
        />

        <button
          type="submit"
          disabled={submitting || imageState.preparing || !imageState.file}
          className="h-12 w-full rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300"
        >
          {imageState.preparing ? t.indoor_image_preparing : submitting ? t.indoor_submitting : t.indoor_submit}
        </button>
      </form>
    </PageLayout>
  );
}
