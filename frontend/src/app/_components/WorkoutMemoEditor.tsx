"use client";

import { useState } from "react";
import { updateWorkoutMemo, invalidateWorkoutDetail } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import type { User } from "firebase/auth";

const MEMO_MAX = 500;

type Props = {
  workoutId: number;
  initialMemo: string | null | undefined;
  user: User;
};

export function WorkoutMemoEditor({ workoutId, initialMemo, user }: Props) {
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialMemo ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const displayed = saved !== null ? saved : (initialMemo ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      await updateWorkoutMemo(workoutId, draft, user);
      setSaved(draft);
      invalidateWorkoutDetail(workoutId, user.uid);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(displayed);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(displayed); setEditing(true); }}
        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm transition-colors hover:border-zinc-300 hover:bg-zinc-100"
      >
        {displayed ? (
          <span className="whitespace-pre-wrap leading-relaxed text-zinc-700">{displayed}</span>
        ) : (
          <span className="text-zinc-400">{t.celebration_memo_placeholder}</span>
        )}
      </button>
    );
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
            onClick={handleCancel}
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
