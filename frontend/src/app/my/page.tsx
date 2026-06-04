"use client";

import { useState } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { useWorkoutList, useMe } from "@/lib/api";
import { updateNickname } from "@/lib/api/auth";
import { logout } from "@/lib/auth";
import { formatKm, formatShortDateTime } from "@/lib/format";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { workoutDetailHref } from "@/lib/workoutRoute";
import { formatDuration, formatPaceMinPerKm } from "@/lib/workoutTrack";
import { mutate } from "swr";

export default function MyPage() {
  const { user, loading } = useRequireAuth("/my");
  const { t } = useLocale();
  const { data: me, isLoading: meLoading } = useMe(user);
  const {
    data: records = [],
    isLoading: recordsLoading,
    error,
  } = useWorkoutList(user);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  function startEdit() {
    setDraft(me?.nickname ?? "");
    setNicknameError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setNicknameError(null);
  }

  async function saveNickname() {
    if (!user) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed.length > 20) return;
    setSaving(true);
    setNicknameError(null);
    try {
      await updateNickname(user, trimmed);
      await mutate(["me", user.uid]);
      setEditing(false);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("nickname_taken")) {
        setNicknameError(t.my_nickname_taken);
      } else {
        setNicknameError(t.error_occurred);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) {
    return (
      <PageLayout title={t.my_title}>
        <Card className="text-sm text-zinc-600">{t.loading}</Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t.my_title}>
      <Card>
        <div className="text-sm text-zinc-500">{t.my_account_label}</div>
        <div className="mt-1 text-sm text-zinc-600">{user.email ?? ""}</div>

        <div className="mt-4">
          <div className="text-sm text-zinc-500">{t.my_nickname_label}</div>
          {editing ? (
            <div className="mt-1">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={20}
                placeholder={t.my_nickname_placeholder}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
              {nicknameError && (
                <p className="mt-1 text-xs text-red-600">{nicknameError}</p>
              )}
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
              <span className="text-lg font-medium">
                {meLoading ? "..." : (me?.nickname ?? t.no_name)}
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

        <button
          type="button"
          onClick={() => logout()}
          className="mt-4 h-11 w-full rounded-xl border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          {t.my_logout}
        </button>
      </Card>

      <Card className="mt-6">
        <div className="text-lg font-semibold">{t.my_records_heading}</div>
        {error ? <Alert className="mt-3">{String(error)}</Alert> : null}
        <div className="mt-3">
          {recordsLoading && records.length === 0 ? (
            <SkeletonLines count={3} />
          ) : records.length === 0 ? (
            <div className="text-sm text-zinc-600">{t.my_records_empty}</div>
          ) : (
            <div className="grid gap-2">
              {records.map((r) => (
                <a
                  key={r.id}
                  href={workoutDetailHref(r.id)}
                  className="block rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-zinc-900">{formatShortDateTime(r.startedAt)}</div>
                    <div className="text-xs text-zinc-500">{formatKm(r.distanceM)}</div>
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {formatDuration(r.durationSec)} · {r.calories} kcal · {formatPaceMinPerKm(r.distanceM, r.durationSec)}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </Card>
    </PageLayout>
  );
}
