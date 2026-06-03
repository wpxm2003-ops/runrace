"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { apiFetch } from "@/lib/api";
import { useAuthUser } from "@/lib/useAuthUser";
import { useEffect, useState } from "react";

export default function FitnessPage() {
  const { user, loading } = useAuthUser();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("apple_health");
  const [distanceKm, setDistanceKm] = useState("5.0");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) window.location.href = "/login";
  }, [loading, user]);

  async function onSync() {
    if (!user) return;
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<{ prevKm: string; nowKm: string; deltaKm: string }>(
        "/api/fitness/daily-distance",
        {
          method: "POST",
          user,
          body: { date, source, distanceKm: Number(distanceKm) },
        },
      );
      setResult(`prev=${res.prevKm} now=${res.nowKm} delta=${res.deltaKm}`);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <PageLayout title="오늘 거리 동기화" maxWidth="max-w-md">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm text-zinc-600">
          MVP에서는 헬스 SDK 연동 전이라, “오늘 합산 거리”를 직접 입력해 업로드하는 형태로 연결해둡니다.
        </p>

        <div className="mt-6 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-600">날짜</span>
            <input
              className="h-11 rounded-xl border border-zinc-200 px-3"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              type="date"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-600">소스</span>
            <select
              className="h-11 rounded-xl border border-zinc-200 px-3"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="apple_health">apple_health</option>
              <option value="samsung_health">samsung_health</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-600">거리(km)</span>
            <input
              className="h-11 rounded-xl border border-zinc-200 px-3"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              inputMode="decimal"
            />
          </label>

          <button
            type="button"
            onClick={onSync}
            className="mt-2 h-11 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800"
          >
            업로드
          </button>
        </div>

        {result ? (
          <div className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">
            {result}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>
    </PageLayout>
  );
}

