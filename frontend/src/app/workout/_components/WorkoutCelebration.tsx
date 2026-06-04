"use client";

import { useLocale } from "@/lib/i18n";
import { formatDuration, formatPaceMinPerKm } from "@/lib/workoutTrack";
import { useEffect, useMemo, useRef, useState } from "react";
import { nativeNavigate } from "@/lib/nativeNav";

const CONFETTI_COLORS = ["#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899"] as const;
const AUTO_NAVIGATE_SEC = 15;

type WorkoutCelebrationProps = {
  recordId: number;
  durationSec: number;
  distanceM: number;
  calories: number;
  saving?: boolean;
  onConfirm: () => void;
};

export function WorkoutCelebration({
  durationSec,
  distanceM,
  calories,
  saving = false,
  onConfirm,
}: WorkoutCelebrationProps) {
  const { t } = useLocale();
  const [remaining, setRemaining] = useState(AUTO_NAVIGATE_SEC);
  const navigatedRef = useRef(false);

  const message = useMemo(() => {
    const msgs = t.celebration_messages;
    // Math.random은 이 컴포넌트에서 서버가 아닌 클라이언트에서만 실행됨(saving=false 시 mount)
    return msgs[Math.floor(Math.random() * msgs.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goRecords = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    onConfirm();
    nativeNavigate("/records");
  };

  useEffect(() => {
    if (saving) return;
    setRemaining(AUTO_NAVIGATE_SEC);
    navigatedRef.current = false;
    const interval = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          goRecords();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving]);

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
            style={{ left: p.left, backgroundColor: p.color, animationDelay: p.delay, animationDuration: p.duration, transform: `rotate(${p.rotate})` }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <div className="text-4xl">🎉</div>
        <h2 className="mt-3 text-xl font-semibold text-zinc-900">{t.celebration_title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">{message}</p>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 p-3 text-sm">
          <div>
            <div className="text-zinc-500">{t.stat_time}</div>
            <div className="font-semibold tabular-nums">{formatDuration(durationSec)}</div>
          </div>
          <div>
            <div className="text-zinc-500">{t.stat_distance}</div>
            <div className="font-semibold tabular-nums">{(distanceM / 1000).toFixed(2)}km</div>
          </div>
          <div>
            <div className="text-zinc-500">{t.stat_pace}</div>
            <div className="font-semibold tabular-nums">{formatPaceMinPerKm(distanceM, durationSec)}</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-500">{t.celebration_calories(calories)}</p>

        {saving ? (
          <p className="mt-4 text-sm text-zinc-600">{t.celebration_saving}</p>
        ) : (
          <>
            <button type="button" onClick={goRecords}
              className="mt-5 h-12 w-full rounded-xl bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800">
              {t.celebration_confirm}
            </button>
            <p className="mt-2 text-xs text-zinc-400">{t.celebration_auto(remaining)}</p>
          </>
        )}
      </div>
    </div>
  );
}
