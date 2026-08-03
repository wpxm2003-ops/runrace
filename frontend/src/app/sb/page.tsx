"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { getAdminDashboard, type AdminDashboard } from "@/lib/api";
import { useAuthUser } from "@/lib/useAuthUser";

const dateTime = (value: string) =>
  new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const distance = (meters: number) => `${(meters / 1000).toFixed(2)} km`;

const feedbackTypeLabel = {
  IDEA: "개선 아이디어",
  INCONVENIENCE: "불편한 점",
  BUG: "오류 신고",
  ETC: "기타",
} as const;

const duration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0
    ? `${hours}시간 ${String(minutes).padStart(2, "0")}분`
    : `${minutes}분 ${String(secs).padStart(2, "0")}초`;
};

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-12 text-center text-sm text-zinc-400">{children}</div>;
}

export default function AdminDashboardPage() {
  const { user, loading } = useAuthUser();
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<"unauthorized" | "forbidden" | "error" | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    setError(null);
    void getAdminDashboard(user)
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        if (reason instanceof ApiError && reason.status === 403) setError("forbidden");
        else if (reason instanceof ApiError && reason.status === 401) setError("unauthorized");
        else setError("error");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  if (loading) {
    return <div className="mx-auto w-full max-w-[1400px] px-6 py-10 text-sm text-zinc-400">확인 중...</div>;
  }

  if (!user) {
    return <div className="mx-auto w-full max-w-[1400px] px-6 py-10 text-sm text-zinc-500">로그인 후 이용할 수 있습니다.</div>;
  }

  if (error === "forbidden") {
    return <div className="mx-auto w-full max-w-[1400px] px-6 py-10 text-sm text-zinc-500">관리자 권한이 필요합니다.</div>;
  }

  if (error) {
    return <div className="mx-auto w-full max-w-[1400px] px-6 py-10 text-sm text-red-600">대시보드를 불러오지 못했습니다.</div>;
  }

  if (!dashboard) {
    return <div className="mx-auto w-full max-w-[1400px] px-6 py-10 text-sm text-zinc-400">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">RunRace / Admin</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950">운영 대시보드</h1>
          <p className="mt-2 text-sm text-zinc-500">최근 가입자와 운동 기록을 한눈에 확인합니다.</p>
        </div>
        <span className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white">LIVE</span>
      </div>

      <section className="mb-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-zinc-900">최근 가입자</h2>
            <p className="mt-1 text-xs text-zinc-400">가입일 기준 최신 10명</p>
          </div>
          <span className="text-sm tabular-nums text-zinc-400">{dashboard.members.length}명</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-medium text-zinc-500">
              <tr><th className="px-5 py-3">디스플레이네임</th><th className="px-5 py-3">가입매체</th><th className="px-5 py-3">앱푸시여부</th><th className="px-5 py-3">가입일</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {dashboard.members.length === 0 ? <tr><td colSpan={4}><EmptyState>가입자가 없습니다.</EmptyState></td></tr> : dashboard.members.map((member, index) => (
                <tr key={`${member.createdAt}-${index}`} className="hover:bg-zinc-50"><td className="px-5 py-3.5 font-medium text-zinc-900">{member.displayName || "(이름 없음)"}</td><td className="px-5 py-3.5 text-zinc-600">{member.provider || "-"}</td><td className="px-5 py-3.5"><span className={`rounded-full px-2 py-1 text-xs font-medium ${member.pushEnabled ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>{member.pushEnabled ? "허용" : "미허용"}</span></td><td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-zinc-500">{dateTime(member.createdAt)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div><h2 className="font-semibold text-zinc-900">최근 운동기록</h2><p className="mt-1 text-xs text-zinc-400">노광고 · 방지훈 · 배하영 기록 제외 · 생성일 기준 최신 10개</p></div>
          <span className="text-sm tabular-nums text-zinc-400">{dashboard.workouts.length}개</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-medium text-zinc-500"><tr><th className="px-5 py-3">디스플레이네임</th><th className="px-5 py-3">거리</th><th className="px-5 py-3">시간</th><th className="px-5 py-3">시작일</th><th className="px-5 py-3">종료일</th><th className="px-5 py-3">생성일</th><th className="px-5 py-3">이미지여부</th><th className="px-5 py-3">메모여부</th></tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {dashboard.workouts.length === 0 ? <tr><td colSpan={8}><EmptyState>운동 기록이 없습니다.</EmptyState></td></tr> : dashboard.workouts.map((workout) => (
                <tr key={workout.id} className="hover:bg-zinc-50"><td className="px-5 py-3.5 font-medium text-zinc-900">{workout.displayName || "(이름 없음)"}</td><td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-zinc-700">{distance(workout.distanceM)}</td><td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-zinc-700">{duration(workout.durationSec)}</td><td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-zinc-500">{dateTime(workout.startedAt)}</td><td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-zinc-500">{dateTime(workout.endedAt)}</td><td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-zinc-500">{dateTime(workout.createdAt)}</td><td className="px-5 py-3.5 text-zinc-600">{workout.hasImage ? "있음" : "없음"}</td><td className="px-5 py-3.5 text-zinc-600">{workout.hasMemo ? "있음" : "없음"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mb-8 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-zinc-900">사용자 의견</h2>
            <p className="mt-1 text-xs text-zinc-400">최근 제출된 의견 30건</p>
          </div>
          <span className="text-sm tabular-nums text-zinc-400">{dashboard.feedback.length}건</span>
        </div>
        {dashboard.feedback.length === 0 ? (
          <EmptyState>아직 제출된 의견이 없습니다.</EmptyState>
        ) : (
          <div className="divide-y divide-zinc-100">
            {dashboard.feedback.map((item) => (
              <article key={item.id} className="px-5 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                    {feedbackTypeLabel[item.type]}
                  </span>
                  <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                    {item.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                  <span>작성자: {item.userDisplayName || "(이름 없음)"}</span>
                  <span aria-hidden="true">·</span>
                  <span>{dateTime(item.createdAt)}</span>
                </div>
                <h3 className="mt-3 font-semibold text-zinc-950">{item.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{item.content}</p>
                {item.imageUrls.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.imageUrls.map((url, index) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-24 w-24 overflow-hidden rounded-lg bg-zinc-100"
                      >
                        <img
                          src={url}
                          alt={`${item.title} 첨부 이미지 ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
