"use client";

import { workoutDetailHref } from "@/lib/workoutRoute";
import { formatDuration, formatPaceMinPerKm } from "@/lib/workoutTrack";
import { useEffect, useMemo, useRef } from "react";

const MESSAGES = [
  "고생 많았어요! 오늘도 정말 잘 해냈어요!",
  "멋진 운동이었어요! 수고하셨습니다!",
  "끝까지 해냈어요! 당신 최고예요!",
  "오늘의 노력, 분명히 쌓이고 있어요!",
  "완주! 이 기세로 계속 가봐요!",
] as const;

const CONFETTI_COLORS = [
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
] as const;

type WorkoutCelebrationProps = {
  recordId: number;
  durationSec: number;
  distanceM: number;
  calories: number;
  saving?: boolean;
  onConfirm: () => void;
};

export function WorkoutCelebration({
  recordId,
  durationSec,
  distanceM,
  calories,
  saving = false,
  onConfirm,
}: WorkoutCelebrationProps) {
  const message = useMemo(
    () => MESSAGES[Math.floor(Math.random() * MESSAGES.length)],
    [],
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigatedRef = useRef(false);

  const goDetail = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    onConfirm();
    window.location.href = workoutDetailHref(recordId);
  };

  useEffect(() => {
    if (saving) return;
    timerRef.current = setTimeout(() => goDetail(), 3000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, recordId]);

  const particles = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        left: `${(i * 17) % 100}%`,
        delay: `${(i % 8) * 0.08}s`,
        duration: `${1.8 + (i % 5) * 0.25}s`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: `${(i * 47) % 360}deg`,
      })),
    [],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            className="confetti-piece absolute top-0 block h-3 w-2 rounded-sm opacity-90"
            style={{
              left: p.left,
              backgroundColor: p.color,
              animationDelay: p.delay,
              animationDuration: p.duration,
              transform: `rotate(${p.rotate})`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <div className="text-4xl">🎉</div>
        <h2 className="mt-3 text-xl font-semibold text-zinc-900">운동 완료!</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">{message}</p>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 p-3 text-sm">
          <div>
            <div className="text-zinc-500">시간</div>
            <div className="font-semibold tabular-nums">
              {formatDuration(durationSec)}
            </div>
          </div>
          <div>
            <div className="text-zinc-500">거리</div>
            <div className="font-semibold tabular-nums">
              {(distanceM / 1000).toFixed(2)}km
            </div>
          </div>
          <div>
            <div className="text-zinc-500">페이스</div>
            <div className="font-semibold tabular-nums">
              {formatPaceMinPerKm(distanceM, durationSec)}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-500">{calories} kcal 소모 (추정)</p>

        {saving ? (
          <p className="mt-4 text-sm text-zinc-600">기록 저장 중...</p>
        ) : (
          <>
            <button
              type="button"
              onClick={goDetail}
              className="mt-5 h-12 w-full rounded-xl bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800"
            >
              확인
            </button>
            <p className="mt-2 text-xs text-zinc-400">3초 후 기록 상세로 이동합니다</p>
          </>
        )}
      </div>
    </div>
  );
}
