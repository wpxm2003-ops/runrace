"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { NavRowButton } from "@/app/_components/NavRowButton";
import {
  createCrew,
  joinCrew,
  crewNudge,
  useMyCrew,
  useCrewRecap,
  useCrewInsights,
  useCrewRaces,
  useMyCrewMatches,
  invalidateMyCrew,
  toDisplayError,
  reportClientError,
} from "@/lib/api";
import type { CrewInsights, CrewMatchSummary, CrewView } from "@/lib/api/types";
import { challengeDetailHref } from "@/lib/challengeRoute";
import { formatGoalDistance } from "@/lib/units";
import { CrewRecapCard } from "./_components/CrewRecapCard";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { handleAuthFailure } from "@/lib/auth";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance } from "@/lib/units";
import { toast } from "sonner";

/** 초대 코드 입력 정규화 — 대문자 6자(코드 알파벳과 동일 폭). */
function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function crewErrorMessage(e: unknown, t: ReturnType<typeof useLocale>["t"]): string {
  const msg = String(e);
  if (msg.includes("crew_name_taken")) return t.crew_err_name_taken;
  if (msg.includes("invalid_crew_name")) return t.crew_err_name_invalid;
  if (msg.includes("already_in_crew")) return t.crew_err_already_in_crew;
  if (msg.includes("crew_not_found")) return t.crew_err_not_found;
  if (msg.includes("crew_full")) return t.crew_err_full;
  return toDisplayError(e) ?? t.error_occurred;
}

/** 크루 없음 — 만들기 / 초대 코드 가입 온보딩. */
function CrewOnboarding({ user, onDone }: { user: User; onDone: () => void }) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(kind: "create" | "join", fn: () => Promise<void>, successToast: string) {
    if (busy) return;
    setBusy(kind);
    setActionError(null);
    try {
      await fn();
      toast.success(successToast);
      onDone();
    } catch (e) {
      void reportClientError({
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? (e.stack ?? null) : null,
        kind: "action",
      });
      if (!handleAuthFailure(e, "/crew")) setActionError(crewErrorMessage(e, t));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Card>
        <p className="text-sm text-zinc-600">{t.crew_onboard_intro}</p>
      </Card>

      <Card className="mt-4">
        <div className="text-base font-semibold">{t.crew_create_heading}</div>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(stripForbiddenText(e.target.value).slice(0, 20))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim().length >= 2)
                void run("create", () => createCrew(name.trim(), user), t.toast_crew_created);
            }}
            placeholder={t.crew_create_placeholder}
            maxLength={20}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => run("create", () => createCrew(name.trim(), user), t.toast_crew_created)}
            disabled={busy !== null || name.trim().length < 2}
            className="shrink-0 rounded-lg bg-zinc-900 px-4 text-sm text-white disabled:opacity-50"
          >
            {busy === "create" ? t.crew_create_busy : t.crew_create_btn}
          </button>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="text-base font-semibold">{t.crew_join_heading}</div>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.length === 6)
                void run("join", () => joinCrew(code, user), t.toast_crew_joined);
            }}
            placeholder={t.crew_join_placeholder}
            maxLength={6}
            autoCapitalize="characters"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm uppercase tracking-widest focus:border-zinc-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => run("join", () => joinCrew(code, user), t.toast_crew_joined)}
            disabled={busy !== null || code.length !== 6}
            className="shrink-0 rounded-lg bg-zinc-900 px-4 text-sm text-white disabled:opacity-50"
          >
            {busy === "join" ? t.crew_join_busy : t.crew_join_btn}
          </button>
        </div>
        {actionError ? <p className="mt-2 text-xs text-red-600">{actionError}</p> : null}
      </Card>
    </>
  );
}

/**
 * 주간 보드 한 줄 — 순위·닉네임(리더/나 뱃지)·거리·횟수. 0km는 흐리게 + 콕 찌르기(레이스 넛지 UI 패턴).
 * 프리셋 칩은 행 안에서 인라인 확장(ChallengeLeaderboard와 동일 인터랙션).
 */
function BoardRow({
  rank,
  nickname,
  isLeader,
  isMe,
  weekDistanceM,
  weekRuns,
  onNudge,
  nudged,
  nudging,
}: {
  rank: number;
  nickname: string | null;
  isLeader: boolean;
  isMe: boolean;
  weekDistanceM: number;
  weekRuns: number;
  onNudge?: (variant: number) => void;
  nudged: boolean;
  nudging: boolean;
}) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const [pickerOpen, setPickerOpen] = useState(false);
  const idle = weekDistanceM === 0;
  const showNudge = idle && !isMe && onNudge;
  return (
    <div className={`py-2.5 ${idle && !showNudge ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`flex min-w-0 items-center gap-2.5 ${idle ? "opacity-60" : ""}`}>
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">
            {rank}
          </span>
          <span className="truncate text-sm font-medium text-zinc-900">
            {nickname ?? t.no_name}
          </span>
          {isLeader ? (
            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              {t.crew_leader_badge}
            </span>
          ) : null}
          {isMe ? (
            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              {t.crew_me_badge}
            </span>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {idle ? (
            <span className="text-xs text-zinc-400">{t.crew_no_record_yet}</span>
          ) : (
            <>
              <span className="text-sm font-semibold tabular-nums text-zinc-900">
                {formatDistance(weekDistanceM, unit)}
              </span>
              <span className="ml-1.5 text-xs text-zinc-400">{t.crew_week_runs(weekRuns)}</span>
            </>
          )}
        </div>
      </div>
      {showNudge ? (
        pickerOpen ? (
          <div className="mt-1.5 flex flex-wrap gap-1 pl-9">
            {t.nudge_presets.map((label, i) => (
              <button
                key={i}
                type="button"
                disabled={nudging}
                onClick={() => {
                  setPickerOpen(false);
                  onNudge(i);
                }}
                className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            disabled={nudging}
            onClick={() => {
              if (nudged) {
                toast.error(t.nudge_already_sent);
                return;
              }
              setPickerOpen(true);
            }}
            className="ml-9 mt-1 rounded-md border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            👊 {t.nudge_btn}
          </button>
        )
      ) : null}
    </div>
  );
}

/** 인사이트 스탯 타일 — 지난주 대비/내 기여/누적. */
function StatTile({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  return (
    <div className="min-w-0 text-center">
      <div className="truncate text-[11px] text-zinc-400">{label}</div>
      <div
        className={`mt-1 truncate text-sm font-semibold tabular-nums ${
          tone === "green" ? "text-emerald-600" : "text-zinc-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** "2026-07-06" → "7.6" */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}.${Number(d)}`;
}

/** "YYYY-MM-DD" 기준 n일 뒤 ISO date. 잔디 그리드 셀 날짜 계산용. */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function todayIso(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** 대항전 요약 한 줄 — 탭하면 상세로. */
function MatchRow({ m, text }: { m: CrewMatchSummary; text: string }) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      onClick={() => nativeNavigate(`/crew/match?id=${m.id}`)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-100 p-3 text-left hover:bg-zinc-50"
    >
      <span className="min-w-0 truncate text-sm text-zinc-800">{text}</span>
      <span className="shrink-0 text-xs text-zinc-400">{t.crew_match_view} ›</span>
    </button>
  );
}

/** 크루 대항전 섹션 — 전적 + 진행중 스코어 + 받은/보낸 도전장 + 최근 결과. */
function CrewMatchSection({ user, isLeader }: { user: User; isLeader: boolean }) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const { data } = useMyCrewMatches(user, true);

  const record = data?.record;
  const hasRecord = record && record.wins + record.losses + record.draws > 0;
  const hasAny =
    !!data &&
    (data.current != null ||
      data.pendingReceived.length > 0 ||
      data.pendingSent.length > 0 ||
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
        {isLeader ? (
          <button
            type="button"
            onClick={() => nativeNavigate("/crew/challenge")}
            className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            {t.crew_match_challenge_btn}
          </button>
        ) : null}
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

          {data.pendingReceived.map((m) => (
            <MatchRow key={m.id} m={m} text={`⚔️ ${t.crew_match_received(m.challengerCrewName)}`} />
          ))}
          {data.pendingSent.map((m) => (
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

/** 크루 잔디 — 최근 5주(월~일) 날짜별 뛴 멤버 수를 깃허브 잔디 스타일로. */
function HeatmapGrid({ insights }: { insights: CrewInsights }) {
  const runnersByDate = new Map(insights.heatmap.map((d) => [d.date, d.runners]));
  const today = todayIso();
  const cells = Array.from({ length: 35 }, (_, i) => {
    const date = addDaysIso(insights.heatmapFrom, i);
    return { date, runners: runnersByDate.get(date) ?? 0, future: date > today };
  });

  function cellClass(runners: number, future: boolean): string {
    if (future) return "bg-transparent";
    if (runners === 0 || insights.memberCount === 0) return "bg-zinc-100";
    const ratio = runners / insights.memberCount;
    if (ratio <= 1 / 3) return "bg-emerald-200";
    if (ratio <= 2 / 3) return "bg-emerald-400";
    return "bg-emerald-600";
  }

  return (
    <div className="grid grid-cols-7 gap-1">
      {cells.map((c) => (
        <div
          key={c.date}
          title={c.future ? undefined : `${shortDate(c.date)} · ${c.runners}`}
          className={`h-5 rounded ${cellClass(c.runners, c.future)}`}
        />
      ))}
    </div>
  );
}

/** 크루 홈 — 크루 정보 + 인사이트 스탯 + 이번 주 보드(목표·넛지) + 지난주 결산. */
function CrewHome({ crew, user }: { crew: CrewView; user: User }) {
  const { t } = useLocale();
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
  const goalReached = goalM != null && weekTotalM >= goalM;

  async function copyInvite() {
    const url = `${window.location.origin}/crew/join?code=${crew.joinCode}`;
    try {
      await navigator.clipboard.writeText(url);
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
      toast.success(t.nudge_sent);
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
          <button
            type="button"
            onClick={copyInvite}
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            {t.crew_invite_btn}
          </button>
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
            onClick={() => nativeNavigate("/challenges/create?crew=1")}
            className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            {t.crew_race_create_btn}
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
                    ? "bg-emerald-100 text-emerald-700"
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
                        {r.isMember ? (
                          <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            {t.races_joined}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {t.races_goal_members(formatGoalDistance(r.goalKm, unit), r.memberCount)}
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
        {/* 주간 크루 목표 진행률 (리더가 설정한 경우만) */}
        {goalM != null ? (
          <div className="mt-3 rounded-xl bg-zinc-50 p-3">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-zinc-600">{t.crew_goal_label}</span>
              <span
                className={
                  goalReached ? "font-semibold text-emerald-600" : "tabular-nums text-zinc-500"
                }
              >
                {goalReached
                  ? t.crew_goal_reached
                  : `${formatDistance(weekTotalM, unit)} / ${formatDistance(goalM, unit)}`}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
              <div
                className={`h-full rounded-full transition-all ${
                  goalReached ? "bg-emerald-500" : "bg-zinc-900"
                }`}
                style={{ width: `${Math.min(100, Math.round((weekTotalM / goalM) * 100))}%` }}
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
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-semibold">{t.crew_recap_heading}</div>
              <div className="mt-0.5 text-xs text-zinc-400">
                {shortDate(recap.weekStartDate)} ~ {shortDate(recap.weekEndDate)}
              </div>
            </div>
            <CrewRecapCard
              crewName={crew.name}
              memberCount={crew.members.length}
              recap={recap}
              unit={unit}
              t={t}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 px-2 py-3">
            <StatTile
              label={t.crew_recap_mvp}
              value={recap.mvpNickname ?? "—"}
              tone={recap.mvpNickname ? "green" : undefined}
            />
            <StatTile
              label={t.crew_week_total_label}
              value={formatDistance(recap.totalDistanceM, unit)}
            />
            <StatTile
              label={t.crew_recap_per_capita}
              value={formatDistance(recap.perCapitaDistanceM, unit)}
            />
          </div>
        </Card>
      ) : null}

      {/* 명예의 전당 — 월별 MVP 히스토리(완결된 달만) */}
      {insights && insights.hallOfFame.length > 0 ? (
        <Card className="mt-4">
          <div className="text-base font-semibold">{t.crew_hof_heading}</div>
          <div className="mt-2 divide-y divide-zinc-100">
            {insights.hallOfFame.map((h) => (
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

      <NavRowButton
        title={t.crew_settings_btn}
        onClick={() => nativeNavigate("/crew/settings")}
        className="mt-4"
      />
    </>
  );
}

function CrewContent({ user }: { user: User }) {
  const { data, isLoading, error, mutate } = useMyCrew(user);

  if (error) {
    return (
      <Card>
        <Alert>{toDisplayError(error)}</Alert>
      </Card>
    );
  }
  if (isLoading && !data) {
    return (
      <Card>
        <SkeletonLines count={3} />
      </Card>
    );
  }
  if (!data) return null;

  if (!data.crew) {
    return (
      <CrewOnboarding
        user={user}
        onDone={() => {
          void mutate();
          invalidateMyCrew(user.uid);
        }}
      />
    );
  }
  return <CrewHome crew={data.crew} user={user} />;
}

export default function CrewPage() {
  const { user, loading } = useRequireAuth("/crew");
  const { t } = useLocale();

  if (loading || !user) {
    return (
      <PageLayout title={t.crew_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t.crew_title}>
      <CrewContent user={user} />
    </PageLayout>
  );
}
