"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Badge } from "@/app/_components/ui/Badge";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import {
  acceptCrewMatch,
  declineCrewMatch,
  cancelCrewMatch,
  useCrewMatchDetail,
  useMyCrew,
  invalidateCrewMatches,
  toDisplayError,
  mapErrorMessage,
  reportClientError,
} from "@/lib/api";
import type { CrewMatchDetail, CrewMatchRosterRow } from "@/lib/api/types";
import { handleAuthFailure } from "@/lib/auth";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance } from "@/lib/units";
import { toast } from "sonner";

/** "2026-07-15T00:00:00+09:00" → "7.15" */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function daysLeft(endAt: string): number {
  return Math.max(0, Math.ceil((new Date(endAt).getTime() - Date.now()) / 86_400_000));
}

/** 양 크루 점수 히어로 — 내 크루 관점으로 좌측 고정 + 비율 바. */
function ScoreHero({ detail }: { detail: CrewMatchDetail }) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const myName = detail.myCrewIsChallenger ? detail.challengerCrewName : detail.opponentCrewName;
  const opName = detail.myCrewIsChallenger ? detail.opponentCrewName : detail.challengerCrewName;
  const myDist = detail.myCrewIsChallenger ? detail.challengerDistanceM : detail.opponentDistanceM;
  const opDist = detail.myCrewIsChallenger ? detail.opponentDistanceM : detail.challengerDistanceM;
  const total = myDist + opDist;
  const myPct = total === 0 ? 50 : Math.round((myDist / total) * 100);

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-emerald-700">{myName}</div>
          <div className="text-xl font-bold tabular-nums text-zinc-900">
            {formatDistance(myDist, unit)}
          </div>
        </div>
        <div className="shrink-0 pb-1 text-xs font-semibold text-zinc-400">VS</div>
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-semibold text-zinc-600">{opName}</div>
          <div className="text-xl font-bold tabular-nums text-zinc-900">
            {formatDistance(opDist, unit)}
          </div>
        </div>
      </div>
      <div className="mt-2 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-l-full bg-emerald-500" style={{ width: `${myPct}%` }} />
        <div className="h-full flex-1 rounded-r-full bg-zinc-300" />
      </div>
      {detail.result ? (
        <div
          className={`mt-3 rounded-xl px-3 py-2.5 text-center text-sm font-semibold ${
            detail.result === "WIN"
              ? "bg-emerald-50 text-emerald-700"
              : detail.result === "DRAW"
                ? "bg-zinc-50 text-zinc-600"
                : "bg-zinc-50 text-zinc-600"
          }`}
        >
          {detail.result === "WIN"
            ? t.crew_match_result_win
            : detail.result === "DRAW"
              ? t.crew_match_result_draw
              : t.crew_match_result_loss}
        </div>
      ) : null}
    </div>
  );
}

/** 로스터 기여 리스트(거리 내림차순, 서버 정렬). */
function RosterList({ title, rows }: { title: string; rows: CrewMatchRosterRow[] }) {
  const { t } = useLocale();
  const { unit } = useUnit();
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</div>
      <div className="mt-1 divide-y divide-zinc-100">
        {rows.map((r) => (
          <div key={r.userId} className="flex items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm text-zinc-900">{r.nickname ?? t.no_name}</span>
              {r.isMe ? <Badge tone="emerald">{t.crew_me_badge}</Badge> : null}
            </div>
            <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-700">
              {formatDistance(r.distanceM, unit)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchContent({ matchId, user }: { matchId: number; user: User }) {
  const { t } = useLocale();
  const confirm = useConfirm();
  const { data: detail, error, mutate } = useCrewMatchDetail(matchId, user);
  const { data: crewData } = useMyCrew(user);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  if (error) {
    return (
      <Card>
        <p className="py-4 text-center text-sm text-zinc-600">
          {mapErrorMessage(
            error,
            [{ codes: ["not_participant", "match_not_found"], message: t.crew_match_err_not_found }],
            () => toDisplayError(error) ?? t.error_occurred,
          )}
        </p>
        <button
          type="button"
          onClick={() => nativeNavigate("/crew", { replace: true })}
          className="mt-2 h-10 w-full rounded-xl border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          {t.crew_go_home}
        </button>
      </Card>
    );
  }
  if (!detail) return <LoadingCard />;

  const started = detail.status === "IN_PROGRESS" || detail.status === "ENDED";
  // 배포 틈의 옛 백엔드 응답에도 죽지 않게 배열 필드는 방어적으로 읽는다.
  const myRoster =
    (detail.myCrewIsChallenger ? detail.challengerRoster : detail.opponentRoster) ?? [];
  const opRoster =
    (detail.myCrewIsChallenger ? detail.opponentRoster : detail.challengerRoster) ?? [];
  const myName = detail.myCrewIsChallenger ? detail.challengerCrewName : detail.opponentCrewName;
  const opName = detail.myCrewIsChallenger ? detail.opponentCrewName : detail.challengerCrewName;

  async function run(action: () => Promise<void>, successToast: string, goHome = false) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      invalidateCrewMatches(user.uid);
      toast.success(successToast);
      if (goHome) {
        nativeNavigate("/crew", { replace: true });
      } else {
        await mutate();
        setBusy(false);
      }
    } catch (e) {
      void reportClientError({
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? (e.stack ?? null) : null,
        kind: "action",
      });
      if (!handleAuthFailure(e, `/crew/match?id=${matchId}`)) {
        toast.error(mapErrorMessage(
          e,
          [
            { codes: ["match_expired"], message: t.crew_match_err_expired },
            { codes: ["invalid_roster", "roster_not_member"], message: t.crew_match_err_roster },
            { codes: ["opponent_busy", "match_already_active"], message: t.crew_match_err_busy_mine },
          ],
          () => toDisplayError(e) ?? t.error_occurred,
        ));
      }
      setBusy(false);
    }
  }

  return (
    <>
      {/* 대결 개요 */}
      <Card>
        <div className="text-center">
          <div className="text-base font-semibold text-zinc-900">
            {detail.challengerCrewName} <span className="text-zinc-400">vs</span>{" "}
            {detail.opponentCrewName}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {t.crew_match_roster_format(detail.rosterSize)}
            {detail.startAt && detail.endAt
              ? ` · ${shortDate(detail.startAt)} ~ ${shortDate(detail.endAt)}`
              : ""}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-400">{t.crew_match_gps_only}</div>
          <div className="mt-2">
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                detail.status === "IN_PROGRESS"
                  ? "bg-emerald-100 text-emerald-700"
                  : detail.status === "PENDING" || detail.status === "SCHEDULED"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {detail.status === "PENDING"
                ? t.crew_match_status_pending
                : detail.status === "SCHEDULED"
                  ? t.crew_match_status_scheduled
                  : detail.status === "IN_PROGRESS"
                    ? `${t.races_filter_in_progress} · D-${detail.endAt ? daysLeft(detail.endAt) : 0}`
                    : detail.status === "ENDED"
                      ? t.races_filter_ended
                      : detail.status === "DECLINED"
                        ? t.crew_match_status_declined
                        : t.crew_match_status_expired}
            </span>
          </div>
        </div>
      </Card>

      {/* 점수 (시작 후) */}
      {started ? (
        <Card className="mt-4">
          <ScoreHero detail={detail} />
        </Card>
      ) : null}

      {/* 시작 대기 안내 */}
      {detail.status === "SCHEDULED" && detail.startAt ? (
        <Card className="mt-4">
          <p className="py-2 text-center text-sm text-zinc-600">
            {t.crew_match_starts(shortDate(detail.startAt))}
          </p>
        </Card>
      ) : null}

      {/* 수락 대기 — 상대 리더에겐 로스터 선택 + 수락/거절, 그 외엔 안내 */}
      {detail.status === "PENDING" ? (
        detail.canAccept && crewData?.crew ? (
          <Card className="mt-4">
            <div className="flex items-baseline justify-between">
              <div className="text-base font-semibold">
                {t.crew_match_accept_roster_label(detail.rosterSize)}
              </div>
              <div
                className={`text-xs ${
                  selected.size === detail.rosterSize
                    ? "font-semibold text-emerald-600"
                    : "text-zinc-400"
                }`}
              >
                {t.crew_match_roster_count(selected.size)}
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {crewData.crew.members.map((m) => {
                const checked = selected.has(m.userId);
                return (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.userId)) {
                          next.delete(m.userId);
                        } else if (next.size < detail.rosterSize) {
                          next.add(m.userId);
                        }
                        return next;
                      })
                    }
                    className={`flex items-center gap-2 rounded-xl border p-3 text-left ${
                      checked ? "border-zinc-900 bg-zinc-50" : "border-zinc-100 hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                        checked
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-300 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="truncate text-sm font-medium text-zinc-900">
                      {m.nickname ?? t.no_name}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={busy || selected.size !== detail.rosterSize}
              onClick={() =>
                run(
                  () => acceptCrewMatch(detail.id, [...selected], user),
                  t.toast_match_accepted,
                )
              }
              className="mt-4 h-11 w-full rounded-xl bg-zinc-900 text-sm text-white disabled:opacity-50"
            >
              {busy ? t.crew_match_accepting : t.crew_match_accept_btn}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({
                  title: t.crew_match_decline_btn,
                  message: t.crew_match_decline_confirm,
                  confirmLabel: t.crew_match_decline_btn,
                  cancelLabel: t.cancel,
                  destructive: true,
                });
                if (ok) void run(() => declineCrewMatch(detail.id, user), t.toast_match_declined, true);
              }}
              className="mt-2 h-10 w-full rounded-xl text-sm text-zinc-500 hover:bg-zinc-50"
            >
              {t.crew_match_decline_btn}
            </button>
          </Card>
        ) : (
          <Card className="mt-4">
            <p className="py-2 text-center text-sm text-zinc-600">{t.crew_match_pending_wait}</p>
            {detail.canCancel ? (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({
                    title: t.crew_match_cancel_btn,
                    message: t.crew_match_cancel_confirm,
                    confirmLabel: t.crew_match_cancel_btn,
                    cancelLabel: t.cancel,
                    destructive: true,
                  });
                  if (ok) void run(() => cancelCrewMatch(detail.id, user), t.toast_match_canceled, true);
                }}
                className="mt-2 h-10 w-full rounded-xl text-sm text-red-600 hover:bg-red-50"
              >
                {t.crew_match_cancel_btn}
              </button>
            ) : null}
          </Card>
        )
      ) : null}

      {/* 로스터 — 수락 후(시작 대기 포함)부터 노출 */}
      {detail.status !== "PENDING" && detail.status !== "DECLINED" && detail.status !== "EXPIRED" ? (
        <Card className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <RosterList title={myName} rows={myRoster} />
            <RosterList title={opName} rows={opRoster} />
          </div>
        </Card>
      ) : null}
    </>
  );
}

export default function CrewMatchPage() {
  // returnTo 미지정 → 현재 경로+쿼리(?id=N)로 복귀해 로그인 후에도 대결 링크가 살아있다.
  const { user, loading } = useRequireAuth();
  const { t } = useLocale();

  // 정적 export 환경 — 매치 id는 쿼리(?id=N)에서 마운트 후에 읽는다(hydration mismatch 방지).
  const [matchId, setMatchId] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("id");
    const parsed = raw ? Number(raw) : NaN;
    setMatchId(Number.isInteger(parsed) && parsed > 0 ? parsed : null);
  }, []);

  if (loading || !user || matchId === undefined) {
    return (
      <PageLayout title={t.crew_match_detail_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  if (matchId === null) {
    return (
      <PageLayout title={t.crew_match_detail_title}>
        <Card>
          <p className="py-4 text-center text-sm text-zinc-600">{t.crew_match_err_not_found}</p>
          <button
            type="button"
            onClick={() => nativeNavigate("/crew", { replace: true })}
            className="mt-2 h-10 w-full rounded-xl border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            {t.crew_go_home}
          </button>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t.crew_match_detail_title}>
      <MatchContent matchId={matchId} user={user} />
    </PageLayout>
  );
}
