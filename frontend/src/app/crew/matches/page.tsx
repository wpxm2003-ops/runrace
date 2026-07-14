"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import {
  toDisplayError,
  useCrewMatchHistoryInfinite,
  useMyCrew,
  useMyCrewMatches,
} from "@/lib/api";
import type { CrewMatchStatus, CrewMatchSummary } from "@/lib/api/types";
import { formatDateRange } from "@/lib/format";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useLocale } from "@/lib/i18n";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";

function statusLabel(status: CrewMatchStatus, t: ReturnType<typeof useLocale>["t"]): string {
  switch (status) {
    case "PENDING": return t.crew_match_status_pending;
    case "SCHEDULED": return t.crew_match_status_scheduled;
    case "IN_PROGRESS": return t.races_filter_in_progress;
    case "ENDED": return t.races_filter_ended;
    case "DECLINED": return t.crew_match_status_declined;
    case "EXPIRED": return t.crew_match_status_expired;
  }
}

function statusClass(status: CrewMatchStatus): string {
  if (status === "PENDING" || status === "SCHEDULED") return "bg-amber-100 text-amber-700";
  if (status === "IN_PROGRESS") return "bg-sky-100 text-sky-700";
  return "bg-zinc-100 text-zinc-500";
}

function HistoryRow({ match }: { match: CrewMatchSummary }) {
  const { t, locale } = useLocale();
  const opponent = match.myCrewIsChallenger
    ? match.opponentCrewName
    : match.challengerCrewName;
  const result = match.result === "WIN"
    ? t.crew_match_result_win
    : match.result === "DRAW"
      ? t.crew_match_result_draw
      : match.result === "LOSS"
        ? t.crew_match_result_loss
        : null;

  return (
    <button
      type="button"
      onClick={() => nativeNavigate(`/crew/match?id=${match.id}`)}
      className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-left hover:bg-zinc-50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-zinc-900">
          {t.crew_match_vs(opponent)}
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusClass(match.status)}`}>
          {statusLabel(match.status, t)}
        </span>
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        {match.startAt ? formatDateRange(match.startAt, match.endAt, locale) : "-"}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-zinc-500">
        <span>{t.crew_match_roster_format(match.rosterSize)}</span>
        {result ? <span className="font-medium text-zinc-700">{result}</span> : null}
      </div>
    </button>
  );
}

export default function CrewMatchesPage() {
  const { user, loading } = useRequireAuth("/crew/matches");
  const { t } = useLocale();
  const history = useCrewMatchHistoryInfinite(user);
  const { data: crewData } = useMyCrew(user);
  const { data: matchState } = useMyCrewMatches(user, Boolean(user));
  const items = history.data ? history.data.flatMap((page) => page.items) : [];
  const hasNext = history.data
    ? (history.data[history.data.length - 1]?.hasNext ?? false)
    : false;
  const sentinelRef = useInfiniteScroll({
    hasNext,
    isValidating: history.isValidating,
    setSize: history.setSize,
    size: history.size,
  });
  const isLeader = crewData?.crew?.isLeader ?? false;
  const hasActiveRequest = Boolean(
    matchState?.current ||
    (matchState?.pendingReceived?.length ?? 0) > 0 ||
    (matchState?.pendingSent?.length ?? 0) > 0,
  );
  const canChallenge = isLeader && matchState != null && !hasActiveRequest;

  return (
    <PageLayout
      title={t.crew_match_history_title}
      actions={canChallenge ? (
        <button
          type="button"
          onClick={() => nativeNavigate("/crew/challenge")}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          {t.crew_match_challenge_btn}
        </button>
      ) : undefined}
    >
      {isLeader && matchState && hasActiveRequest ? (
        <Alert tone="warning" className="mb-4">{t.crew_match_challenge_unavailable}</Alert>
      ) : null}
      <Card>
        {history.error ? (
          <Alert>{toDisplayError(history.error)}</Alert>
        ) : loading || !user || (!history.data && history.isLoading) ? (
          <SkeletonLines count={3} />
        ) : items.length === 0 ? (
          <p className="text-sm text-zinc-500">{t.crew_match_history_empty}</p>
        ) : (
          <div className="grid gap-2">
            {items.map((match) => <HistoryRow key={match.id} match={match} />)}
            {hasNext ? <div ref={sentinelRef} className="py-3 text-center text-sm text-zinc-400">{t.loading}</div> : null}
          </div>
        )}
      </Card>
    </PageLayout>
  );
}
