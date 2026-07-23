"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { TextInput } from "@/app/_components/ui/TextInput";
import { createCrew, joinCrew, toDisplayError, mapErrorMessage, reportClientError } from "@/lib/api";
import { CREW_REGIONS, crewRegionLabel, type CrewRegionCode } from "@/lib/crewRegion";
import { CrewRegionPicker, type CrewRegionOption } from "./CrewRegionPicker";
import { MyApplicationsSection } from "./MyApplicationsSection";
import { CrewDiscovery } from "./CrewDiscovery";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { handleAuthFailure, redirectToLogin } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

/** 초대 코드 입력 정규화 — 대문자 6자(코드 알파벳과 동일 폭). */
function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function crewErrorMessage(e: unknown, t: ReturnType<typeof useLocale>["t"]): string {
  return mapErrorMessage(
    e,
    [
      { codes: ["crew_name_taken"], message: t.crew_err_name_taken },
      { codes: ["invalid_crew_name"], message: t.crew_err_name_invalid },
      { codes: ["invalid_region"], message: t.crew_err_invalid_region },
      { codes: ["already_in_crew"], message: t.crew_err_already_in_crew },
      { codes: ["crew_not_found"], message: t.crew_err_not_found },
      { codes: ["crew_full"], message: t.crew_err_full },
    ],
    () => toDisplayError(e) ?? t.error_occurred,
  );
}

/** 크루 없음 — 만들기 / 초대 코드 가입 온보딩. */
export function CrewOnboarding({ user, onDone }: { user: User | null; onDone: () => void }) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [region, setRegion] = useState<CrewRegionCode | "">("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const regionOptions: CrewRegionOption[] = CREW_REGIONS.map((value) => ({
    value,
    label: crewRegionLabel(value, t),
  }));

  function requireLogin() {
    redirectToLogin("/crew");
  }

  async function run(kind: "create" | "join", fn: () => Promise<void>, successToast: string) {
    if (busy) return;
    if (!user) {
      requireLogin();
      return;
    }
    setBusy(kind);
    if (kind === "join") setJoinError(null);
    if (kind === "create") setCreateError(null);
    try {
      await fn();
      toast.success(successToast);
      onDone();
    } catch (e) {
      void reportClientError({
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? (e.stack ?? null) : null,
        kind: "action",
      });
      if (!handleAuthFailure(e, "/crew")) {
        const message = crewErrorMessage(e, t);
        if (kind === "join") setJoinError(message);
        if (kind === "create") setCreateError(message);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {user ? <MyApplicationsSection user={user} /> : null}

      <Card className="mt-4">
        <div className="text-base font-semibold">{t.crew_join_heading}</div>
        <p className="mt-1 text-xs text-zinc-400">{t.crew_join_hint}</p>
        <div className="mt-3 flex gap-2">
          <TextInput
            type="text"
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.length === 6)
                void run("join", () => joinCrew(code, user!), t.toast_crew_joined);
            }}
            placeholder={t.crew_join_placeholder}
            maxLength={6}
            autoCapitalize="characters"
            className="min-w-0 flex-1 uppercase tracking-widest"
          />
          <button
            type="button"
            onClick={() => run("join", () => joinCrew(code, user!), t.toast_crew_joined)}
            disabled={busy !== null || code.length !== 6}
            className="shrink-0 rounded-lg bg-zinc-900 px-4 text-sm text-white disabled:opacity-50"
          >
            {busy === "join" ? t.crew_join_busy : t.crew_join_btn}
          </button>
        </div>
        {joinError ? <p className="mt-2 text-xs text-red-600">{joinError}</p> : null}
      </Card>

      <Card className="mt-4">
        <div className="text-base font-semibold">{t.crew_create_heading}</div>
        <p className="mt-1 text-xs text-zinc-400">{t.crew_create_hint}</p>
        <div className="mt-3 flex flex-col gap-2">
          <TextInput
            type="text"
            value={name}
            onChange={(e) => setName(stripForbiddenText(e.target.value).slice(0, 20))}
            placeholder={t.crew_create_placeholder}
            maxLength={20}
            className="w-full"
          />
          <CrewRegionPicker
            value={region}
            options={regionOptions}
            placeholder={t.crew_region_placeholder}
            title={t.crew_profile_region_label}
            onChange={(value) => setRegion(value as CrewRegionCode)}
            disabled={busy !== null}
          />
          {createError ? <p className="text-xs text-red-600">{createError}</p> : null}
          <button
            type="button"
            onClick={() =>
              run(
                "create",
                () => createCrew(name.trim(), region as CrewRegionCode, user!),
                t.toast_crew_created,
              )
            }
            disabled={busy !== null || name.trim().length < 2 || !region}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm text-white disabled:opacity-50"
          >
            {busy === "create" ? t.crew_create_busy : t.crew_create_btn}
          </button>
        </div>
      </Card>

      <CrewDiscovery user={user} />
    </>
  );
}
