"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { invalidateAfterNicknameChange } from "@/lib/api";
import { containsForbiddenText, stripForbiddenText } from "@/lib/forbiddenTextChars";
import { updateNickname } from "@/lib/api/auth";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

type Props = {
  user: User;
  nickname: string | null | undefined;
  loading: boolean;
};

export function NicknameEditor({ user, nickname, loading }: Props) {
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [nicknameHint, setNicknameHint] = useState<string | null>(null);

  function onDraftChange(raw: string) {
    const stripped = stripForbiddenText(raw).slice(0, 20);
    setDraft(stripped);
    setNicknameHint(stripped.length !== raw.length ? t.my_nickname_invalid_chars : null);
    setNicknameError(null);
  }

  function startEdit() {
    setDraft(nickname ?? "");
    setNicknameError(null);
    setNicknameHint(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setNicknameError(null);
    setNicknameHint(null);
  }

  async function saveNickname() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed.length > 20) return;
    if (containsForbiddenText(trimmed)) {
      setNicknameError(t.my_nickname_invalid_chars);
      return;
    }
    setSaving(true);
    setNicknameError(null);
    try {
      await updateNickname(user, trimmed);
      invalidateAfterNicknameChange(user.uid);
      setEditing(false);
      toast.success(t.toast_nickname_saved);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("nickname_taken")) {
        setNicknameError(t.my_nickname_taken);
      } else if (msg.includes("invalid_nickname_chars")) {
        setNicknameError(t.my_nickname_invalid_chars);
      } else {
        setNicknameError(t.error_occurred);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="text-sm text-zinc-500">{t.my_nickname_label}</div>
      {editing ? (
        <div className="mt-1">
          <input
            type="text"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            maxLength={20}
            placeholder={t.my_nickname_placeholder}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          {nicknameHint ? (
            <p className="mt-1 text-xs text-zinc-500">{nicknameHint}</p>
          ) : null}
          {nicknameError ? (
            <p className="mt-1 text-xs text-red-600">{nicknameError}</p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={saveNickname}
              disabled={saving || !draft.trim()}
              className="h-9 rounded-lg bg-zinc-900 px-4 text-sm text-white disabled:opacity-50"
            >
              {saving ? t.saving : t.my_nickname_save}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="h-9 rounded-lg border border-zinc-200 px-4 text-sm text-zinc-700"
            >
              {t.my_nickname_cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-base font-medium">
            {loading ? "..." : (nickname ?? t.no_name)}
          </span>
          <button
            type="button"
            onClick={startEdit}
            className="text-sm text-zinc-500 underline"
          >
            {t.my_nickname_edit}
          </button>
        </div>
      )}
    </div>
  );
}
