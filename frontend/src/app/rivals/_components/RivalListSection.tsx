"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Alert } from "@/app/_components/ui/Alert";
import { AsyncList } from "@/app/_components/ui/AsyncList";
import { Card } from "@/app/_components/ui/Card";
import { removeRival, useRivals, toDisplayError, reportAndDisplay } from "@/lib/api";
import type { RivalRow } from "@/lib/api/types";
import { handleAuthFailure } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

function winRate(wins: number, losses: number): string | null {
  const games = wins + losses;
  if (games === 0) return null;
  const pct = (wins / games) * 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(0);
}

function RivalListRow({
  rival,
  onRemove,
  removing,
}: {
  rival: RivalRow;
  onRemove: (id: string) => void;
  removing: boolean;
}) {
  const { t } = useLocale();
  const rate = winRate(rival.wins, rival.losses);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 p-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-zinc-900">
          {rival.nickname ?? t.no_name}
        </div>
        <div className="mt-0.5 text-[11px] text-zinc-500">
          {t.head_to_head_record(rival.wins, rival.losses)}
          {rate != null ? ` · ${t.rival_winrate(rate)}` : ""}
        </div>
      </div>
      <button
        type="button"
        disabled={removing}
        onClick={() => onRemove(rival.rivalUserId)}
        className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
      >
        {t.rival_remove}
      </button>
    </div>
  );
}

/** 라이벌 목록 — 승패전적과 함께 표시, 개별 삭제. */
export function RivalListSection({ user }: { user: User }) {
  const { t } = useLocale();
  const { data: rivals, isLoading, error, mutate: mutateRivals } = useRivals(user);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function onRemove(rivalUserId: string) {
    setRemovingId(rivalUserId);
    setActionError(null);
    try {
      await removeRival(rivalUserId, user);
      void mutateRivals();
      toast.success(t.toast_rival_removed);
    } catch (e) {
      if (!handleAuthFailure(e, "/rivals")) setActionError(reportAndDisplay(e));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.rival_list_heading}</div>
      {error ? <Alert className="mt-3">{toDisplayError(error)}</Alert> : null}
      {actionError ? <p className="mt-2 text-xs text-red-600">{actionError}</p> : null}
      <div className="mt-3">
        <AsyncList
          isLoading={isLoading}
          data={rivals}
          isEmpty={(d) => d.length === 0}
          emptyMessage={t.rival_empty}
          skeletonCount={2}
        >
          {(rivals) => (
            <div className="flex flex-col gap-2">
              {rivals.map((r) => (
                <RivalListRow
                  key={r.rivalUserId}
                  rival={r}
                  onRemove={onRemove}
                  removing={removingId === r.rivalUserId}
                />
              ))}
            </div>
          )}
        </AsyncList>
      </div>
    </Card>
  );
}
