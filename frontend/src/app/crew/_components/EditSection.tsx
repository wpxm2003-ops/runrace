"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { updateCrew, toDisplayError } from "@/lib/api";
import type { CrewView } from "@/lib/api/types";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { handleAuthFailure } from "@/lib/auth";
import { nativeNavigate } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

/** 리더 전용 — 이름·공지·주간 목표 수정 폼. */
export function EditSection({ crew, user, onSaved }: { crew: CrewView; user: User; onSaved: () => void }) {
  const { t } = useLocale();
  const [notice, setNotice] = useState(crew.notice ?? "");
  const [goal, setGoal] = useState(crew.weekGoalKm != null ? String(crew.weekGoalKm) : "");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // 백그라운드 재검증으로 crew 값이 갱신되면 편집 전 초기값도 따라가게 한다(편집 중엔 유지).
  useEffect(() => {
    setNotice(crew.notice ?? "");
    setGoal(crew.weekGoalKm != null ? String(crew.weekGoalKm) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crew.id]);

  async function onSave() {
    if (saving) return;
    // 주간 목표 — 비우면 목표 없음, 값이 있으면 1~9,999 검증(서버와 동일 규칙).
    const goalRaw = goal.trim();
    const goalKm = goalRaw === "" ? null : Number(goalRaw);
    if (goalKm != null && (!Number.isFinite(goalKm) || goalKm < 1 || goalKm > 9999)) {
      setActionError(t.crew_err_goal_invalid);
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      await updateCrew(
        crew.id,
        { notice: notice.trim() || null, weekGoalKm: goalKm },
        user,
      );
      toast.success(t.toast_crew_saved);
      onSaved();
      nativeNavigate("/crew", { replace: true });
    } catch (e) {
      if (!handleAuthFailure(e, "/crew/settings")) {
        const msg = String(e);
        setActionError(
          msg.includes("crew_name_taken")
            ? t.crew_err_name_taken
            : msg.includes("invalid_crew_name")
              ? t.crew_err_name_invalid
              : msg.includes("invalid_week_goal")
                ? t.crew_err_goal_invalid
                : (toDisplayError(e) ?? t.error_occurred),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <label className="text-sm text-zinc-500" htmlFor="crew-name">
        {t.crew_field_name}
      </label>
      <div id="crew-name" className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
        {crew.name}
      </div>
      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-notice">
        {t.crew_field_notice}
      </label>
      <input
        id="crew-notice"
        type="text"
        value={notice}
        onChange={(e) => setNotice(stripForbiddenText(e.target.value).slice(0, 100))}
        placeholder={t.crew_field_notice_placeholder}
        maxLength={100}
        className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <label className="mt-4 block text-sm text-zinc-500" htmlFor="crew-goal">
        {t.crew_field_goal}
      </label>
      <input
        id="crew-goal"
        type="text"
        inputMode="decimal"
        value={goal}
        onChange={(e) => setGoal(e.target.value.replace(/[^0-9.]/g, "").slice(0, 7))}
        placeholder={t.crew_field_goal_placeholder}
        className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <p className="mt-1.5 text-xs text-zinc-400">{t.crew_field_goal_hint}</p>
      {actionError ? <p className="mt-2 text-xs text-red-600">{actionError}</p> : null}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-4 h-10 w-full rounded-xl bg-zinc-900 text-sm text-white disabled:opacity-50"
      >
        {saving ? t.saving : t.crew_settings_apply_btn}
      </button>
    </Card>
  );
}
