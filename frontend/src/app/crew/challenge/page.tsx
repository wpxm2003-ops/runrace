"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import {
  createCrewMatch,
  useMyCrew,
  invalidateCrewMatches,
  toDisplayError,
  reportClientError,
} from "@/lib/api";
import type { CrewView } from "@/lib/api/types";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { handleAuthFailure } from "@/lib/auth";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

const ROSTER_MIN = 3;
const ROSTER_MAX = 10;
const DURATION_OPTIONS = [3, 7, 14];

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

/** 도전장 작성(리더 전용) — 선택한 멤버 수가 곧 로스터 크기(상대 크루도 동수 출전). */
function ChallengeForm({ crew, user }: { crew: CrewView; user: User }) {
  const { t } = useLocale();
  const [opponentName, setOpponentName] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
    opponentName.trim().length >= 2 && selected.size >= ROSTER_MIN && selected.size <= ROSTER_MAX;

  async function onSend() {
    if (!canSend || sending) return;
    setSending(true);
    setActionError(null);
    try {
      await createCrewMatch(
        {
          opponentCrewName: opponentName.trim(),
          rosterSize: selected.size,
          durationDays,
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
        <label className="text-sm text-zinc-500" htmlFor="opponent-name">
          {t.crew_match_opponent_label}
        </label>
        <input
          id="opponent-name"
          type="text"
          value={opponentName}
          onChange={(e) => setOpponentName(stripForbiddenText(e.target.value).slice(0, 20))}
          placeholder={t.crew_match_opponent_placeholder}
          maxLength={20}
          className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />

        <div className="mt-4 text-sm text-zinc-500">{t.crew_match_duration_label}</div>
        <div className="mt-1.5 flex gap-2">
          {DURATION_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDurationDays(d)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                durationDays === d
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {t.crew_match_days(d)}
            </button>
          ))}
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

  return (
    <PageLayout title={t.crew_match_create_title}>
      <ChallengeForm crew={data.crew} user={user} />
    </PageLayout>
  );
}
