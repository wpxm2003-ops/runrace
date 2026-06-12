"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance } from "@/lib/units";

/** 길게 눌러 해제까지 필요한 시간(ms). 스친 터치는 이 시간을 못 채워 무시된다. */
const HOLD_MS = 1500;
const R = 46;
const CIRC = 2 * Math.PI * R;

/**
 * 러닝 중 오터치 방지 오버레이.
 * 전체 화면을 덮어 아래 버튼(일시정지·종료·탭)에 터치가 닿지 않게 하고,
 * 기록(시간·거리·페이스)은 계속 보여준다. 해제는 길게 누르기로만 가능.
 */
export function RunLockOverlay({
  elapsedLabel,
  distanceM,
  paceLabel,
  onUnlock,
}: {
  elapsedLabel: string;
  distanceM: number;
  paceLabel: string;
  onUnlock: () => void;
}) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  const stopHold = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setProgress(0);
  }, []);

  const beginHold = useCallback(() => {
    startRef.current = performance.now();
    const loop = () => {
      const p = Math.min(1, (performance.now() - startRef.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        stopHold();
        onUnlock();
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [onUnlock, stopHold]);

  useEffect(() => stopHold, [stopHold]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-10 bg-zinc-900/95 text-white"
      style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex flex-col items-center">
        <div className="text-sm text-zinc-400">{t.run_lock_locked}</div>
        <div className="mt-1 text-5xl font-semibold tabular-nums">{elapsedLabel}</div>
        <div className="mt-4 flex gap-8 text-center">
          <div>
            <div className="text-xs text-zinc-400">{t.stat_distance}</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">
              {formatDistance(distanceM, unit)}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">{t.stat_pace}</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">{paceLabel}</div>
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label={t.run_lock_hold}
        className="relative flex h-28 w-28 select-none items-center justify-center rounded-full"
        style={{ touchAction: "none" }}
        onPointerDown={beginHold}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
      >
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={R} fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="4" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <span className="px-3 text-center text-xs font-medium leading-tight text-white">
          {t.run_lock_hold}
        </span>
      </button>
    </div>
  );
}
