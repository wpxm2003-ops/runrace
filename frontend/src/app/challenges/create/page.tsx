"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { apiFetch } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
import {
  addDays,
  todayStr,
  validateCreateChallengeForm,
} from "@/lib/challengeForm";
import { useAuthUser } from "@/lib/useAuthUser";
import { useEffect, useMemo, useState } from "react";

type ActiveCount = { activeCount: number; maxActive: number };

export default function CreateChallengePage() {
  const { user, loading } = useAuthUser();
  const today = useMemo(() => todayStr(), []);
  const [title, setTitle] = useState("");
  const [goalKm, setGoalKm] = useState("");
  const [maxMembers, setMaxMembers] = useState("10");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(() => addDays(todayStr(), 1));
  const [activeCount, setActiveCount] = useState<ActiveCount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const endMin = startDate ? addDays(startDate, 1) : addDays(today, 1);

  useEffect(() => {
    if (!loading && !user) {
      redirectToLogin("/challenges/create");
      return;
    }
    if (!user) return;
    apiFetch<ActiveCount>("/api/challenges/active-count", { user })
      .then(setActiveCount)
      .catch((e) => setError(String(e)));
  }, [loading, user]);

  const canCreate =
    activeCount != null && activeCount.activeCount < activeCount.maxActive;

  function onGoalKmChange(v: string) {
    setGoalKm(v.replace(/\D/g, ""));
  }

  function onMaxMembersChange(v: string) {
    const digits = v.replace(/\D/g, "");
    if (!digits) {
      setMaxMembers("");
      return;
    }
    const n = Math.min(50, parseInt(digits, 10));
    setMaxMembers(String(n));
  }

  function onStartDateChange(v: string) {
    setStartDate(v);
    if (endDate && v && endDate <= v) {
      setEndDate(addDays(v, 1));
    }
  }

  async function onSubmit() {
    if (!user || !canCreate) return;
    setError(null);

    const validationError = validateCreateChallengeForm({
      title,
      goalKm,
      maxMembers,
      startDate,
      endDate,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const goal = parseInt(goalKm, 10);
      const max = parseInt(maxMembers, 10);

      await apiFetch<{ id: number }>("/api/challenges", {
        method: "POST",
        user,
        body: {
          title: title.trim(),
          goalKm: goal,
          maxMembers: max,
          startDate,
          endDate,
        },
      });
      window.location.href = "/challenges";
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageLayout
      title="방 만들기"
      actions={
        <a className="text-sm text-zinc-600 hover:underline" href="/challenges">
          목록
        </a>
      }
    >
        {activeCount && !canCreate ? (
          <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            종료되지 않은 방은 최대 {activeCount.maxActive}개까지 만들 수 있습니다.
            (현재 {activeCount.activeCount}개)
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium">
            제목 <span className="text-red-500">*</span>
          </label>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 6월 러닝 대결"
            required
          />

          <label className="mt-4 block text-sm font-medium">
            목표 km <span className="text-red-500">*</span>
          </label>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
            inputMode="numeric"
            pattern="[0-9]*"
            value={goalKm}
            onChange={(e) => onGoalKmChange(e.target.value)}
            placeholder="정수만 입력"
            required
          />

          <label className="mt-4 block text-sm font-medium">
            인원수 (최대 50명) <span className="text-red-500">*</span>
          </label>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
            inputMode="numeric"
            pattern="[0-9]*"
            value={maxMembers}
            onChange={(e) => onMaxMembersChange(e.target.value)}
            required
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">
                시작일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
                value={startDate}
                min={today}
                onChange={(e) => onStartDateChange(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium">
                종료일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
                value={endDate}
                min={endMin}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="button"
            disabled={!canCreate || submitting}
            onClick={onSubmit}
            className="mt-6 h-11 w-full rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300"
          >
            {submitting ? "생성 중..." : "방 생성"}
          </button>
        </div>
    </PageLayout>
  );
}
