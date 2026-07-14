"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { Alert } from "@/app/_components/ui/Alert";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { DateTimePickerSheet } from "@/app/challenges/_components/DateTimePickerSheet";
import {
  createCrewMatch,
  useMyCrew,
  useMyCrewMatches,
  useCrewSearch,
  invalidateCrewMatches,
  toDisplayError,
  reportClientError,
} from "@/lib/api";
import type { CrewSearchItem, CrewView } from "@/lib/api/types";
import {
  localDatetimeToIso,
  minStartAtLocal,
  plusDaysLocal,
  validateDateWindow,
} from "@/lib/challengeForm";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { handleAuthFailure } from "@/lib/auth";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

const ROSTER_MIN = 2;
const ROSTER_MAX = 50;

function matchErrorMessage(e: unknown, t: ReturnType<typeof useLocale>["t"]): string {
  const msg = String(e);
  if (msg.includes("crew_not_found")) return t.crew_match_err_opponent_not_found;
  if (msg.includes("cannot_challenge_self")) return t.crew_match_err_self;
  if (msg.includes("opponent_too_small")) return t.crew_match_err_opponent_small;
  if (msg.includes("match_already_active")) return t.crew_match_err_busy_mine;
  if (msg.includes("opponent_busy")) return t.crew_match_err_busy_opponent;
  if (msg.includes("invalid_roster") || msg.includes("roster_not_member"))
    return t.crew_match_err_roster;
  return toDisplayError(e) ?? t.error_occurred;
}

/**
 * 도전장 작성(리더 전용) — 상대는 검색·선택, 선택한 멤버 수가 곧 로스터 크기(상대도 동수 출전).
 * 대결 기간(시작/종료일시)은 레이스 등록과 동일한 규칙으로 직접 설정한다.
 * 목표 없이 항상 기간 내 무제한 — 로스터 합산 거리가 더 큰 크루가 승리한다.
 */
function ChallengeForm({ crew, user }: { crew: CrewView; user: User }) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [opponent, setOpponent] = useState<CrewSearchItem | null>(null);
  const [startAt, setStartAt] = useState(() => plusDaysLocal(minStartAtLocal(), 1));
  const [endAt, setEndAt] = useState(() => plusDaysLocal(minStartAtLocal(), 8));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // 타이핑 중 서버 검색 난사 방지 — 250ms 디바운스 후 쿼리별 SWR 캐시.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  // 상대를 아직 안 골랐고 검색어를 입력했을 때만 조회 — 크루가 많아져도 목록이 무한정 늘어나지 않는다.
  const showResults = !opponent && debouncedSearch.length > 0;
  const { data: crews, isLoading: searching } = useCrewSearch(debouncedSearch, user, showResults);

  function selectOpponent(c: CrewSearchItem) {
    setOpponent(c);
    setSearch("");
  }

  function changeOpponent() {
    setOpponent(null);
    setSearch("");
  }

  function toggleMember(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else if (next.size < ROSTER_MAX) {
        next.add(userId);
      }
      return next;
    });
  }

  const canSend =
    opponent != null && selected.size >= ROSTER_MIN && selected.size <= ROSTER_MAX;

  function validateForm(): string | null {
    return validateDateWindow(startAt, endAt, {
      startRequired: t.create_err_start_required,
      endRequired: t.create_err_end_required,
      startTooSoon: t.create_err_start_too_soon,
      endAfterStart: t.create_err_end_after_start,
      durationTooLong: t.crew_match_err_duration_too_long,
    });
  }

  async function onSend() {
    if (!canSend || !opponent || sending) return;
    const validationError = validateForm();
    if (validationError) {
      setActionError(validationError);
      return;
    }
    setSending(true);
    setActionError(null);
    try {
      await createCrewMatch(
        {
          opponentCrewName: opponent.name,
          rosterSize: selected.size,
          startAt: localDatetimeToIso(startAt),
          endAt: localDatetimeToIso(endAt),
          rosterUserIds: [...selected],
        },
        user,
      );
      invalidateCrewMatches(user.uid);
      toast.success(t.toast_match_sent);
      nativeNavigate("/crew", { replace: true });
    } catch (e) {
      void reportClientError({
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? (e.stack ?? null) : null,
        kind: "action",
      });
      if (!handleAuthFailure(e, "/crew/challenge")) setActionError(matchErrorMessage(e, t));
      setSending(false);
    }
  }

  return (
    <>
      <Card>
        <p className="text-sm text-zinc-600">{t.crew_match_notice}</p>
      </Card>

      <Card className="mt-4">
        <label className="text-sm text-zinc-500" htmlFor="opponent-search">
          {t.crew_match_opponent_label}
        </label>
        {opponent ? (
          <div className="mt-1.5 flex items-center justify-between gap-3 rounded-lg border border-zinc-300 px-3 py-2">
            <span className="truncate text-sm font-medium text-emerald-700">
              {t.crew_match_opponent_selected(opponent.name)}
            </span>
            <button
              type="button"
              onClick={changeOpponent}
              className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-700"
            >
              {t.crew_match_opponent_change}
            </button>
          </div>
        ) : (
          <>
            <input
              id="opponent-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(stripForbiddenText(e.target.value).slice(0, 20))}
              placeholder={t.crew_match_opponent_placeholder}
              maxLength={20}
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
            {/* 검색어를 입력했을 때만 결과를 펼친다 — 크루 수가 늘어도 목록이 항상 떠 있지 않게. */}
            {showResults ? (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-zinc-100">
                {!crews && searching ? (
                  <div className="p-3">
                    <SkeletonLines count={2} />
                  </div>
                ) : !crews || crews.length === 0 ? (
                  <p className="p-3 text-sm text-zinc-400">{t.crew_match_search_empty}</p>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {crews.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectOpponent(c)}
                        className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-zinc-50"
                      >
                        <span className="truncate text-sm font-medium text-zinc-900">{c.name}</span>
                        <span className="shrink-0 text-xs text-zinc-400">
                          {t.crew_match_search_members(c.memberCount)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-zinc-500">{t.create_field_start}</label>
            <DateTimePickerSheet
              value={startAt}
              onChange={setStartAt}
              min={minStartAtLocal()}
              label={t.create_field_start}
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-500">{t.create_field_end}</label>
            <DateTimePickerSheet
              value={endAt}
              onChange={setEndAt}
              min={startAt || minStartAtLocal()}
              label={t.create_field_end}
            />
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex items-baseline justify-between">
          <div className="text-base font-semibold">{t.crew_match_roster_label}</div>
          <div
            className={`text-xs ${
              selected.size >= ROSTER_MIN ? "font-semibold text-emerald-600" : "text-zinc-400"
            }`}
          >
            {t.crew_match_roster_count(selected.size)}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {crew.members.map((m) => {
            const checked = selected.has(m.userId);
            return (
              <button
                key={m.userId}
                type="button"
                onClick={() => toggleMember(m.userId)}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left ${
                  checked ? "border-zinc-900 bg-zinc-50" : "border-zinc-100 hover:bg-zinc-50"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
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
                  {m.isMe ? (
                    <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      {t.crew_me_badge}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
        {actionError ? <p className="mt-3 text-xs text-red-600">{actionError}</p> : null}
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend || sending}
          className="mt-4 h-11 w-full rounded-xl bg-zinc-900 text-sm text-white disabled:opacity-50"
        >
          {sending ? t.crew_match_sending : t.crew_match_send_btn}
        </button>
      </Card>
    </>
  );
}

export default function CrewChallengePage() {
  const { user, loading } = useRequireAuth("/crew/challenge");
  const { t } = useLocale();
  const { data } = useMyCrew(user ?? null);
  const { data: matchState } = useMyCrewMatches(user ?? null, Boolean(user));

  if (loading || !user || !data) {
    return (
      <PageLayout title={t.crew_match_create_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  // 미소속·비리더 — 크루 홈으로 안내(도전장은 리더 전용).
  if (!data.crew || !data.crew.isLeader) {
    return (
      <PageLayout title={t.crew_match_create_title}>
        <Card>
          <p className="py-4 text-center text-sm text-zinc-600">{t.crew_match_leader_only}</p>
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

  const hasActiveRequest = Boolean(
    matchState?.current ||
    (matchState?.pendingReceived?.length ?? 0) > 0 ||
    (matchState?.pendingSent?.length ?? 0) > 0,
  );
  if (matchState && hasActiveRequest) {
    return (
      <PageLayout title={t.crew_match_create_title}>
        <Alert tone="warning">{t.crew_match_challenge_unavailable}</Alert>
        <button
          type="button"
          onClick={() => nativeNavigate("/crew/matches", { replace: true })}
          className="mt-4 h-10 w-full rounded-xl border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          {t.crew_matches_view_all}
        </button>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t.crew_match_create_title}>
      <ChallengeForm crew={data.crew} user={user} />
    </PageLayout>
  );
}
