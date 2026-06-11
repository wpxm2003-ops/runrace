"use client";

import { useEffect, useState } from "react";

type Props = {
  onComplete: () => void;
};

const STEP_MS = 900;
const TOTAL_MS = 3 * STEP_MS; // 2700ms

export function WorkoutCountdown({ onComplete }: Props) {
  const [step, setStep] = useState<number>(3);

  useEffect(() => {
    let current = 3;
    const tick = () => {
      current -= 1;
      setStep(current);
      if (current <= 0) {
        setTimeout(onComplete, STEP_MS);
      } else {
        setTimeout(tick, STEP_MS);
      }
    };
    const timer = setTimeout(tick, STEP_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const isGo = step === 0;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      {/* 블러 배경 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* 카운트다운 원 — 컨테이너는 리마운트하지 않아야 ring 애니메이션이 연속으로 동작 */}
      <div className="relative flex h-36 w-36 items-center justify-center rounded-full bg-white shadow-2xl">
        {/* 원형 진행 테두리: 마운트 시점부터 2700ms 동안 linear하게 채워짐 */}
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 144 144">
          <circle
            cx="72" cy="72" r="66"
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="414.69"
            strokeDashoffset="414.69"
            style={{
              animation: `countdown-ring ${TOTAL_MS}ms linear forwards`,
              stroke: isGo ? "#22c55e" : "#18181b",
              transition: "stroke 200ms ease",
            }}
          />
        </svg>

        {/* 숫자만 key로 팝 애니메이션 */}
        <span
          key={step}
          className={`relative text-5xl font-black tabular-nums tracking-tight
            animate-[countdown-pop_0.3s_ease-out]
            ${isGo ? "text-green-500" : "text-zinc-900"}`}
        >
          {isGo ? "GO!" : step}
        </span>
      </div>
    </div>
  );
}
