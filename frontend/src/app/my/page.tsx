"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { fetchWorkouts, type WorkoutListItem } from "@/lib/api";
import { logout } from "@/lib/auth";
import { formatKm, formatShortDateTime } from "@/lib/format";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { workoutDetailHref } from "@/lib/workoutRoute";
import { formatDuration, formatPaceMinPerKm } from "@/lib/workoutTrack";
import { useEffect, useState } from "react";

export default function MyPage() {
  const { user, loading } = useRequireAuth("/my");
  const { t } = useLocale();
  const [records, setRecords] = useState<WorkoutListItem[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setRecordsLoading(true);
    fetchWorkouts(user)
      .then(setRecords)
      .catch((e) => setError(String(e)))
      .finally(() => setRecordsLoading(false));
  }, [user]);

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
        <div className="mt-2 text-lg font-medium">{user.displayName ?? t.no_name}</div>
        <div className="mt-1 text-sm text-zinc-600">{user.email ?? ""}</div>
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
        {error ? <Alert className="mt-3">{error}</Alert> : null}
        <div className="mt-3 grid gap-2">
          {recordsLoading ? (
            <div className="text-sm text-zinc-600">{t.my_records_loading}</div>
          ) : records.length === 0 ? (
            <div className="text-sm text-zinc-600">{t.my_records_empty}</div>
          ) : (
            records.map((r) => (
              <a key={r.id} href={workoutDetailHref(r.id)} className="block rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-zinc-900">{formatShortDateTime(r.startedAt)}</div>
                  <div className="text-xs text-zinc-500">{formatKm(r.distanceM)}</div>
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {formatDuration(r.durationSec)} · {r.calories} kcal · {formatPaceMinPerKm(r.distanceM, r.durationSec)}
                </div>
              </a>
            ))
          )}
        </div>
      </Card>
    </PageLayout>
  );
}
