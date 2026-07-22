"use client";

import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { useMyCrewMatches } from "@/lib/api";
import { nativeNavigate } from "@/lib/nativeNav";
import { formatDistance } from "@/lib/units";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { MatchRow } from "./MatchRow";

/** 크루 대항전 섹션 — 전적 + 진행중 스코어 + 받은/보낸 도전장 + 최근 결과. */
export function CrewMatchSection({ user, isLeader }: { user: User; isLeader: boolean }) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const { data } = useMyCrewMatches(user, true);

  const record = data?.record;
  const hasRecord = record && record.wins + record.losses + record.draws > 0;
  // 배포 틈의 옛 백엔드 응답에도 죽지 않게 배열 필드는 방어적으로 읽는다.
  const pendingReceived = data?.pendingReceived ?? [];
  const pendingSent = data?.pendingSent ?? [];
  const hasAny =
    !!data &&
    (data.current != null ||
      pendingReceived.length > 0 ||
      pendingSent.length > 0 ||
      data.lastEnded != null);

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <div className="text-base font-semibold">{t.crew_match_heading}</div>
          {hasRecord ? (
            <div className="text-xs text-zinc-500">
              {t.crew_match_record(record.wins, record.losses, record.draws)}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => nativeNavigate("/crew/matches")}
          className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          {t.crew_matches_view_all}
        </button>
      </div>

      {!data ? (
        <div className="mt-3">
          <SkeletonLines count={1} />
        </div>
      ) : !hasAny ? (
        <p className="mt-3 text-sm text-zinc-500">
          {isLeader ? t.crew_match_empty_leader : t.crew_match_empty_member}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {/* 진행중·시작대기 대결 — 스코어 카드 */}
          {data.current ? (
            <button
              type="button"
              onClick={() => nativeNavigate(`/crew/match?id=${data.current!.id}`)}
              className="w-full rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-left"
            >
              {(() => {
                const m = data.current!;
                const total = m.myCrewDistanceM + m.opponentCrewDistanceM;
                const myPct = total === 0 ? 50 : Math.round((m.myCrewDistanceM / total) * 100);
                const myName = m.myCrewIsChallenger ? m.challengerCrewName : m.opponentCrewName;
                const opName = m.myCrewIsChallenger ? m.opponentCrewName : m.challengerCrewName;
                const dLeft = m.endAt
                  ? Math.max(0, Math.ceil((new Date(m.endAt).getTime() - Date.now()) / 86_400_000))
                  : 0;
                return (
                  <>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-semibold text-emerald-800">{myName}</span>
                      <span className="shrink-0 font-medium text-zinc-400">
                        {m.status === "SCHEDULED"
                          ? t.crew_match_status_scheduled
                          : `D-${dLeft}`}
                      </span>
                      <span className="truncate text-right font-semibold text-zinc-600">
                        {opName}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-sm font-bold tabular-nums text-zinc-900">
                      <span>{formatDistance(m.myCrewDistanceM, unit)}</span>
                      <span className="text-[10px] font-semibold text-zinc-400">VS</span>
                      <span>{formatDistance(m.opponentCrewDistanceM, unit)}</span>
                    </div>
                    <div className="mt-1.5 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-l-full bg-emerald-500" style={{ width: `${myPct}%` }} />
                      <div className="h-full flex-1 rounded-r-full bg-zinc-300" />
                    </div>
                  </>
                );
              })()}
            </button>
          ) : null}

          {pendingReceived.map((m) => (
            <MatchRow key={m.id} m={m} text={`⚔️ ${t.crew_match_received(m.challengerCrewName)}`} />
          ))}
          {pendingSent.map((m) => (
            <MatchRow key={m.id} m={m} text={t.crew_match_sent(m.opponentCrewName)} />
          ))}
          {!data.current && data.lastEnded ? (
            <MatchRow
              key={data.lastEnded.id}
              m={data.lastEnded}
              text={`${t.crew_match_last(
                data.lastEnded.myCrewIsChallenger
                  ? data.lastEnded.opponentCrewName
                  : data.lastEnded.challengerCrewName,
              )} · ${
                data.lastEnded.result === "WIN"
                  ? t.crew_match_result_win
                  : data.lastEnded.result === "DRAW"
                    ? t.crew_match_result_draw
                    : t.crew_match_result_loss
              }`}
            />
          ) : null}
        </div>
      )}
    </Card>
  );
}
