"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { TextArea, TextInput } from "@/app/_components/ui/TextInput";
import { DatePickerSheet } from "@/app/_components/ui/DatePickerSheet";
import {
  updateCrewProfile,
  uploadImage,
  useCrewDetail,
  invalidateCrewDetail,
  toDisplayError,
  mapErrorMessage,
} from "@/lib/api";
import type { CrewView } from "@/lib/api/types";
import { CREW_REGIONS, crewRegionLabel, type CrewRegionCode } from "@/lib/crewRegion";
import { CrewRegionPicker, type CrewRegionOption } from "./CrewRegionPicker";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { handleAuthFailure } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";
import { weekdayLabels, toKstDateOnly } from "@/lib/format";
import { toast } from "sonner";

/**
 * 리더 전용 — 발견 프로필(지역·이미지·소개·정기런) 편집.
 * 현재값은 공개 상세 응답(useCrewDetail)에서 읽는다 — myCrew 홈 응답엔 이 필드들이 없다.
 */
export function ProfileSection({ crew, user, onSaved }: { crew: CrewView; user: User; onSaved: () => void }) {
  const { t, locale } = useLocale();
  const { data: detail, mutate: mutateDetail } = useCrewDetail(crew.id, user);
  const fileRef = useRef<HTMLInputElement>(null);
  const [initialized, setInitialized] = useState(false);
  const [region, setRegion] = useState<CrewRegionCode | "">("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [intro, setIntro] = useState("");
  const [meetupPlace, setMeetupPlace] = useState("");
  const [meetupDays, setMeetupDays] = useState<number[]>([]);
  const [meetupTime, setMeetupTime] = useState("");
  const [foundedAt, setFoundedAt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const regionOptions: CrewRegionOption[] = CREW_REGIONS.map((value) => ({
    value,
    label: crewRegionLabel(value, t),
  }));

  // 상세 응답이 처음 도착했을 때 한 번만 폼을 채운다 — 이후 백그라운드 재검증이 편집 중인 값을 덮어쓰지 않게.
  useEffect(() => {
    if (!detail || initialized) return;
    setRegion(detail.region as CrewRegionCode);
    setImageUrls(detail.imageUrls?.length ? detail.imageUrls : detail.imageUrl ? [detail.imageUrl] : []);
    setIntro(detail.intro ?? "");
    setMeetupPlace(detail.meetupPlace ?? "");
    setMeetupDays(detail.meetupDays);
    setMeetupTime(detail.meetupTime ?? "");
    // 명시적으로 입력한 개설일이 없으면 가입일(createdAt)을 기본값으로 미리 채워둔다 —
    // 상세 화면 표시값과 동일해서(§ CrewDetailContent) 저장해도 실질 변화는 없다.
    setFoundedAt(detail.foundedAt ?? toKstDateOnly(detail.createdAt));
    setInitialized(true);
  }, [detail, initialized]);

  function toggleDay(d: number) {
    setMeetupDays((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b),
    );
  }

  async function onPickImage(file: File | undefined) {
    if (!file || imageUrls.length >= 4) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, user);
      setImageUrls((cur) => [...cur, url].slice(0, 4));
    } catch (e) {
      toast.error(mapErrorMessage(e, [{ codes: ["upload_too_large"], message: t.upload_too_large }], () => t.error_occurred));
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    if (saving || !region) return;
    setSaving(true);
    setActionError(null);
    try {
      await updateCrewProfile(
        crew.id,
        {
          region: region as CrewRegionCode,
          imageUrl: imageUrls[0] ?? null,
          imageUrls,
          intro: intro.trim() || null,
          meetupPlace: meetupPlace.trim() || null,
          meetupDays,
          meetupTime: meetupTime.trim() || null,
          foundedAt: foundedAt || null,
        },
        user,
      );
      toast.success(t.crew_profile_saved_toast);
      void mutateDetail();
      invalidateCrewDetail(crew.id);
      onSaved();
    } catch (e) {
      if (!handleAuthFailure(e, "/crew/settings")) {
        setActionError(mapErrorMessage(
          e,
          [
            { codes: ["invalid_region"], message: t.crew_err_invalid_region },
            {
              codes: ["invalid_image_url", "invalid_intro", "invalid_meetup", "invalid_founded_at"],
              message: t.crew_err_profile_invalid,
            },
          ],
          () => toDisplayError(e) ?? t.error_occurred,
        ));
      }
    } finally {
      setSaving(false);
    }
  }

  if (!detail) {
    return (
      <Card className="mt-4">
        <SkeletonLines count={3} />
      </Card>
    );
  }

  const weekdays = weekdayLabels(locale, true);

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.crew_profile_heading}</div>

      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-profile-region">
        {t.crew_profile_region_label}
      </label>
      <div id="crew-profile-region" className="mt-1.5">
        <CrewRegionPicker
          value={region}
          options={regionOptions}
          placeholder={t.crew_region_placeholder}
          title={t.crew_profile_region_label}
          onChange={(value) => setRegion(value as CrewRegionCode)}
          disabled={saving}
        />
      </div>

      <label className="mt-4 block text-sm text-zinc-500">{t.crew_profile_image_label}</label>
      <p className="mt-1 text-xs text-zinc-400">{t.crew_profile_image_hint}</p>
      <div className="mt-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void onPickImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="grid grid-cols-4 gap-2">
          {imageUrls.map((url, index) => (
            <div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-zinc-100">
              <img src={url} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {index + 1}
              </span>
              <button
                type="button"
                disabled={uploading || saving}
                onClick={() => setImageUrls((cur) => cur.filter((_, i) => i !== index))}
                aria-label={t.crew_profile_image_remove_btn}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-xs text-white disabled:opacity-50"
              >
                x
              </button>
            </div>
          ))}
          {imageUrls.length < 4 ? (
            <button
              type="button"
              disabled={uploading || saving}
              onClick={() => fileRef.current?.click()}
              className="aspect-square rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-3xl font-light text-zinc-400 hover:bg-zinc-100 disabled:opacity-50"
              aria-label={t.crew_profile_image_upload_btn}
            >
              {uploading ? "업로드중.." : "+"}
            </button>
          ) : null}
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-400">
          {imageUrls.length}/4
        </p>
      </div>

      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-profile-intro">
        {t.crew_profile_intro_label}
      </label>
      <TextArea
        id="crew-profile-intro"
        value={intro}
        onChange={(e) => setIntro(stripForbiddenText(e.target.value).slice(0, 500))}
        placeholder={t.crew_profile_intro_placeholder}
        maxLength={500}
        rows={3}
        className="mt-1.5 w-full"
      />
      <p className="mt-1 text-xs text-zinc-400">{t.crew_profile_intro_hint}</p>

      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-profile-meetup-place">
        {t.crew_profile_meetup_place_label}
      </label>
      <TextInput
        id="crew-profile-meetup-place"
        type="text"
        value={meetupPlace}
        onChange={(e) => setMeetupPlace(stripForbiddenText(e.target.value).slice(0, 60))}
        placeholder={t.crew_profile_meetup_place_placeholder}
        maxLength={60}
        className="mt-1.5 w-full"
      />
      <label className="mt-4 block text-sm text-zinc-500">{t.crew_profile_meetup_days_label}</label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {weekdays.map((w, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggleDay(i)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              meetupDays.includes(i)
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {w}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-profile-meetup-time">
        {t.crew_profile_meetup_time_label}
      </label>
      <TextInput
        id="crew-profile-meetup-time"
        type="text"
        value={meetupTime}
        onChange={(e) => setMeetupTime(stripForbiddenText(e.target.value).slice(0, 30))}
        placeholder={t.crew_profile_meetup_time_placeholder}
        maxLength={30}
        className="mt-1.5 w-full"
      />
      <label className="mt-4 block text-sm text-zinc-500">{t.crew_profile_founded_label}</label>
      <DatePickerSheet
        value={foundedAt}
        onChange={setFoundedAt}
        label={t.crew_profile_founded_label}
        placeholder={t.crew_profile_founded_label}
      />
      <p className="mt-1 text-xs text-zinc-400">{t.crew_profile_founded_hint}</p>
      {actionError ? <p className="mt-3 text-xs text-red-600">{actionError}</p> : null}
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !region}
        className="mt-4 h-10 w-full rounded-xl bg-zinc-900 text-sm text-white disabled:opacity-50"
      >
        {saving ? t.saving : t.crew_settings_apply_btn}
      </button>
    </Card>
  );
}
