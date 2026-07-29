"use client";

import { useState } from "react";
import { updateWorkoutMemo, invalidateWorkoutDetail } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";
import type { User } from "firebase/auth";

const MEMO_MAX = 500;

type Props = {
  workoutId: number;
  initialMemo: string | null | undefined;
  user: User;
  /** 저장·취소로 편집이 끝났을 때 — 바텀시트를 닫는 용도(부모가 트리거를 소유). */
  onDone: (savedMemo?: string) => void;
};

/**
 * 메모 편집 폼 — 열리면 바로 편집 상태다(진입 트리거는 WorkoutMemoButton이 담당하므로
 * 여기서 별도의 "보기→클릭→편집" 전환은 없다).
 */
export function WorkoutMemoEditor({ workoutId, initialMemo, user, onDone }: Props) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(initialMemo ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateWorkoutMemo(workoutId, draft, user);
      invalidateWorkoutDetail(workoutId, user.uid);
      toast.success(t.toast_memo_saved);
      onDone(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <textarea
        autoFocus
        value={draft}
        maxLength={MEMO_MAX}
        onChange={(e) => setDraft(e.target.value.slice(0, MEMO_MAX))}
        rows={4}
        className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none"
        placeholder={t.celebration_memo_placeholder}
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-zinc-400">{draft.length}/{MEMO_MAX}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onDone()}
            disabled={saving}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {saving ? t.celebration_memo_saving : t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
