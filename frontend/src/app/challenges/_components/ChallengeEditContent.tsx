"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { apiFetch } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
import { challengeDetailHref, parseChallengeId } from "@/lib/challengeRoute";
import { useAuthUser } from "@/lib/useAuthUser";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ChallengeDetail = {
  id: number;
  title: string;
  goalKm: number;
  maxMembers: number;
  startAt: string;
  endAt: string | null;
  showManage: boolean;
};

function toDateInput(iso: string) {
  return iso.slice(0, 10);
}

export default function ChallengeEditContent() {
  const { user, loading } = useAuthUser();
  const params = useParams();
  const id = useMemo(
    () => parseChallengeId(String(params?.id ?? "")),
    [params?.id],
  );
  const [title, setTitle] = useState("");
  const [goalKm, setGoalKm] = useState("");
  const [maxMembers, setMaxMembers] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      redirectToLogin(id ? `/challenges/${id}/edit` : undefined);
      return;
    }
    if (!id) {
      setError("대결 ID가 없습니다.");
      return;
    }
    if (!user) return;

    apiFetch<ChallengeDetail & { memberCount: number; showManage: boolean }>(
      `/api/challenges/${id}`,
      { user },
    )
      .then((d) => {
        if (!d.showManage) {
          window.location.href = challengeDetailHref(id);
          return;
        }
        setTitle(d.title);
        setGoalKm(String(d.goalKm));
        setMaxMembers(String(d.maxMembers));
        setStartDate(toDateInput(d.startAt));
        setEndDate(d.endAt ? toDateInput(d.endAt) : "");
        setMemberCount(d.memberCount);
      })
      .catch((e) => setError(String(e)));
  }, [id, loading, user]);

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

  async function onSubmit() {
    if (!user || !id) return;
    setError(null);
    setSubmitting(true);
    try {
      const goal = parseInt(goalKm, 10);
      const max = parseInt(maxMembers, 10);
      if (!title.trim()) throw new Error("제목을 입력하세요.");
      if (!goal || goal < 1) throw new Error("목표 km는 1 이상 정수로 입력하세요.");
      if (!max || max < memberCount || max > 50) {
        throw new Error(`인원수는 참여 ${memberCount}명 이상, 50명 이하여야 합니다.`);
      }
      if (endDate < startDate) throw new Error("종료일은 시작일 이후여야 합니다.");

      await apiFetch(`/api/challenges/${id}`, {
        method: "PUT",
        user,
        body: {
          title: title.trim(),
          goalKm: goal,
          maxMembers: max,
          startDate,
          endDate,
        },
      });
      window.location.href = challengeDetailHref(id);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageLayout
      title="방 수정"
      actions={
        <a
          className="text-sm text-zinc-600 hover:underline"
          href={id ? challengeDetailHref(id) : "/challenges"}
        >
          상세
        </a>
      }
    >
        {error ? (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium">제목</label>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <label className="mt-4 block text-sm font-medium">목표 km</label>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
            inputMode="numeric"
            value={goalKm}
            onChange={(e) => onGoalKmChange(e.target.value)}
          />

          <label className="mt-4 block text-sm font-medium">인원수 (최대 50명)</label>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
            inputMode="numeric"
            value={maxMembers}
            onChange={(e) => onMaxMembersChange(e.target.value)}
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">시작일</label>
              <input
                type="date"
                className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">종료일</label>
              <input
                type="date"
                className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={onSubmit}
            className="mt-6 h-11 w-full rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300"
          >
            {submitting ? "저장 중..." : "저장"}
          </button>
        </div>
    </PageLayout>
  );
}
