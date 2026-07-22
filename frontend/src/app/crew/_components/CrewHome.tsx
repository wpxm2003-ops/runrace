"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Badge } from "@/app/_components/ui/Badge";
import { Card } from "@/app/_components/ui/Card";
import {
  crewNudge,
  toDisplayError,
  useCrewRecap,
  useCrewInsights,
  useCrewRaces,
} from "@/lib/api";
import type { CrewView } from "@/lib/api/types";
import { challengeDetailHref } from "@/lib/challengeRoute";
import { formatGoalDistance } from "@/lib/units";
import { formatDateRange, shortMonthDay } from "@/lib/format";
import { handleAuthFailure } from "@/lib/auth";
import { nativeNavigate } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance } from "@/lib/units";
import { toast } from "sonner";
import { StatTile } from "./StatTile";
import { CrewMatchSection } from "./CrewMatchSection";
import { BoardRow } from "./BoardRow";
import { HeatmapGrid } from "./HeatmapGrid";
import { CrewDiscovery } from "./CrewDiscovery";

/** 크루 홈 — 크루 정보 + 인사이트 스탯 + 이번 주 보드(목표·넛지) + 지난주 결산. */
export function CrewHome({ crew, user }: { crew: CrewView; user: User }) {
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const [nudgedIds, setNudgedIds] = useState<Set<string>>(() => new Set());
  const [nudgingId, setNudgingId] = useState<string | null>(null);
  const { data: recap } = useCrewRecap(user, true);
  const { data: insights } = useCrewInsights(user, true);
  const { data: races } = useCrewRaces(user, true);

  const weekTotalM = crew.members.reduce((sum, m) => sum + m.weekDistanceM, 0);
  const myRow = crew.members.find((m) => m.isMe);
  const deltaM = weekTotalM - crew.lastWeekSameTimeDistanceM;
  const myShare =
    weekTotalM > 0 && myRow ? Math.round((myRow.weekDistanceM / weekTotalM) * 100) : null;
  const goalM = crew.weekGoalKm != null ? crew.weekGoalKm * 1000 : null;
  const goalAchievers = goalM != null
    ? crew.members.filter((member) => member.weekDistanceM >= goalM).length
    : 0;
  const crewGoalPercent = crew.members.length > 0
    ? Math.round((goalAchievers / crew.members.length) * 100)
    : 0;

  async function copyInvite() {
    // 링크 대신 초대 코드+안내 문구를 복사한다 — 카톡 인앱/딥링크 제약을 우회하고,
    // 받는 사람이 앱 홈의 크루 버튼에서 코드로 직접 가입한다.
    try {
      await navigator.clipboard.writeText(t.crew_invite_copy_text(crew.joinCode));
      toast.success(t.crew_invite_copied);
    } catch {
      toast.error(t.error_occurred);
    }
  }

  async function onNudge(targetUserId: string, variant: number) {
    if (nudgingId) return;
    setNudgingId(targetUserId);
    try {
      await crewNudge(targetUserId, variant, user);
      setNudgedIds((prev) => new Set(prev).add(targetUserId));
      toast.success(t.nudge_sent(t.nudge_presets[variant]));
    } catch (e) {
      const msg = String(e);
      if (msg.includes("nudge_daily_limit")) {
        setNudgedIds((prev) => new Set(prev).add(targetUserId));
        toast.error(t.nudge_already_sent);
      } else if (!handleAuthFailure(e, "/crew")) {
        toast.error(toDisplayError(e) ?? t.error_occurred);
      }
    } finally {
      setNudgingId(null);
    }
  }

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold text-zinc-900">{crew.name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {t.crew_member_count(crew.members.length, crew.maxMembers)}
            </div>
          </div>
          {crew.isLeader ? (
            <button
              type="button"
              onClick={copyInvite}
              className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              {t.crew_invite_btn}
            </button>
          ) : null}
        </div>
        {crew.notice ? (
          <div className="mt-3 rounded-xl bg-zinc-50 px-3 py-2.5">
            <span className="mr-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              {t.crew_notice_label}
            </span>
            <span className="text-sm text-zinc-700">{crew.notice}</span>
          </div>
        ) : null}
        {/* 인사이트 — 지난주 이맘때 대비 / 내 기여율 / 함께 달린 누적 */}
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 px-2 py-3">
          <StatTile
            label={t.crew_stat_vs_last_week}
            value={`${deltaM >= 0 ? "+" : "-"}${formatDistance(Math.abs(deltaM), unit)}`}
            tone={deltaM > 0 ? "green" : undefined}
          />
          <StatTile label={t.crew_stat_my_share} value={myShare != null ? `${myShare}%` : "—"} />
          <StatTile label={t.crew_stat_all_time} value={formatDistance(crew.allTimeDistanceM, unit)} />
        </div>
      </Card>

      {/* 크루 대항전 — 다른 크루와의 총거리전 */}
      <CrewMatchSection user={user} isLeader={crew.isLeader} />

      {/* 크루 레이스 — 크루원끼리만 겨루는 내부 레이스 */}
      <Card className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-base font-semibold">{t.crew_races_heading}</div>
          <button
            type="button"
            onClick={() => nativeNavigate("/crew/races")}
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            {t.crew_races_view_all}
          </button>
        </div>
        <div className="mt-3">
          {!races || races.length === 0 ? (
            <p className="text-sm text-zinc-500">{t.crew_races_empty}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {races.map((r) => {
                const phaseLabel =
                  r.phase === "IN_PROGRESS"
                    ? t.races_filter_in_progress
                    : r.phase === "ENDED"
                      ? t.races_filter_ended
                      : t.races_filter_scheduled;
                const phaseTone =
                  r.phase === "IN_PROGRESS"
                    ? "bg-sky-100 text-sky-700"
                    : r.phase === "ENDED"
                      ? "bg-zinc-100 text-zinc-500"
                      : "bg-amber-100 text-amber-700";
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => nativeNavigate(challengeDetailHref(r.id))}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-100 p-3 text-left hover:bg-zinc-50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-zinc-900">{r.title}</span>
                        {r.isMember ? <Badge tone="emerald">{t.races_joined}</Badge> : null}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {t.races_goal_members(formatGoalDistance(r.goalKm, unit), r.memberCount)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400">
                        {formatDateRange(r.startAt, r.endAt, locale)}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${phaseTone}`}
                    >
                      {phaseLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex items-baseline justify-between">
          <div className="text-base font-semibold">{t.crew_week_heading}</div>
          <div className="text-sm text-zinc-500">
            {t.crew_week_total_label}{" "}
            <span className="font-semibold tabular-nums text-zinc-900">
              {formatDistance(weekTotalM, unit)}
            </span>
          </div>
        </div>
        {/* 공통 개인 목표를 달성한 크루원 비율 (리더가 설정한 경우만) */}
        {goalM != null ? (
          <div className="mt-3 rounded-xl bg-zinc-50 p-3">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-zinc-600">{t.crew_goal_label}</span>
              <span className={goalAchievers === crew.members.length ? "font-semibold text-emerald-600" : "tabular-nums text-zinc-500"}>
                {t.crew_goal_achievers(goalAchievers, crew.members.length)}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-400">
              {t.crew_goal_per_member(formatDistance(goalM, unit))}
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
              <div
                className={`h-full rounded-full transition-all ${goalAchievers === crew.members.length ? "bg-emerald-500" : "bg-zinc-900"}`}
                style={{ width: `${crewGoalPercent}%` }}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-2 divide-y divide-zinc-100">
          {crew.members.map((m, i) => (
            <BoardRow
              key={m.userId}
              rank={i + 1}
              nickname={m.nickname}
              isLeader={m.isLeader}
              isMe={m.isMe}
              weekDistanceM={m.weekDistanceM}
              weekRuns={m.weekRuns}
              goalM={goalM}
              onNudge={(variant) => onNudge(m.userId, variant)}
              nudged={nudgedIds.has(m.userId)}
              nudging={nudgingId === m.userId}
            />
          ))}
        </div>
      </Card>

      {/* 크루 잔디 — 최근 5주 활동 히트맵 */}
      {insights ? (
        <Card className="mt-4">
          <div className="flex items-baseline justify-between">
            <div className="text-base font-semibold">{t.crew_heatmap_heading}</div>
            <div className="text-xs text-zinc-400">{t.crew_heatmap_caption}</div>
          </div>
          <div className="mt-3">
            <HeatmapGrid insights={insights} />
          </div>
        </Card>
      ) : null}

      {/* 지난주 결산 — 기록이 있던 주만 노출 */}
      {recap && recap.totalRuns > 0 ? (
        <Card className="mt-4">
          <div>
            <div className="min-w-0">
              <div className="text-base font-semibold">{t.crew_recap_heading}</div>
              <div className="mt-0.5 text-xs text-zinc-400">
                {shortMonthDay(recap.weekStartDate)} ~ {shortMonthDay(recap.weekEndDate)}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 px-2 py-3">
            <StatTile
              label={t.crew_recap_mvp}
              value={recap.mvpNickname ?? "-"}
              tone={recap.mvpNickname ? "green" : undefined}
            />
            <StatTile
              label={t.crew_recap_total_distance}
              value={formatDistance(recap.totalDistanceM, unit)}
            />
            <StatTile
              label={t.crew_recap_participants}
              value={String(recap.participantCount ?? 0)}
            />
          </div>
          {/* 배포 틈에 옛 백엔드 응답(leaders 없음)을 읽어도 죽지 않게 방어 */}
          {(recap.leaders ?? []).length > 0 ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {(recap.leaders ?? []).map((leader, index) => (
                <div
                  key={`${leader.rank}-${leader.nickname ?? "unknown"}`}
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${
                    index > 0 ? "border-t border-zinc-100" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                      {t.prize_rank_label(leader.rank)}
                    </span>
                    <span className="truncate text-sm font-medium text-zinc-900">
                      {leader.nickname ?? t.no_name}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">
                    {formatDistance(leader.distanceM, unit)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* 명예의 전당 — 월별 MVP 히스토리(완결된 달만) */}
      {insights && (insights.hallOfFame ?? []).length > 0 ? (
        <Card className="mt-4">
          <div className="text-base font-semibold">{t.crew_hof_heading}</div>
          <div className="mt-2 divide-y divide-zinc-100">
            {(insights.hallOfFame ?? []).map((h) => (
              <div key={h.month} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="shrink-0 text-sm">🏆</span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                    {h.month.replace("-", ".")}
                  </span>
                  <span className="truncate text-sm font-medium text-zinc-900">
                    {h.nickname ?? t.no_name}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">
                  {formatDistance(h.distanceM, unit)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <CrewDiscovery user={user} />

    </>
  );
}
