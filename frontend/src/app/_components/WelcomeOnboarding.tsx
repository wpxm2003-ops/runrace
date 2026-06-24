"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { useNativeBack } from "@/lib/useNativeBack";
import { nativeNavigate } from "@/lib/nativeNav";

const SEEN_KEY = "runrace_onboarded";

/**
 * 첫 방문자에게 앱의 핵심 루프(기록 → 레이스)를 3단계로 안내하는 환영 오버레이.
 * localStorage 플래그로 1회만 노출한다. 로그인 여부와 무관하게 처음 진입한 사용자에게 보여준다.
 */
export function WelcomeOnboarding() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // 마운트 후 클라이언트에서만 localStorage 확인 (SSR 불일치 방지)
  useEffect(() => {
    if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
  }, []);

  function close() {
    localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  }

  function goGuide() {
    close();
    nativeNavigate("/guides/app");
  }

  useNativeBack(close, open);

  if (!open) return null;

  const steps = [
    { emoji: "🏃", title: t.onboarding_step1_title, desc: t.onboarding_step1_desc },
    { emoji: "📝", title: t.onboarding_step2_title, desc: t.onboarding_step2_desc },
    { emoji: "🏆", title: t.onboarding_step3_title, desc: t.onboarding_step3_desc },
  ];
  const isLast = step === steps.length - 1;
  const current = steps[step];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-10 sm:items-center sm:pb-10">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex justify-end">
          {!isLast ? (
            <button
              type="button"
              onClick={close}
              className="text-xs font-medium text-zinc-400 hover:text-zinc-600"
            >
              {t.onboarding_skip}
            </button>
          ) : (
            <span className="h-4" />
          )}
        </div>

        <div className="flex min-h-[12rem] flex-col items-center justify-center px-2 text-center">
          <div className="text-5xl">{current.emoji}</div>
          <h2 className="mt-4 text-xl font-bold text-zinc-900">{current.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">{current.desc}</p>
        </div>

        <div className="mt-5 flex items-center justify-center gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-5 bg-zinc-900" : "w-1.5 bg-zinc-200"
              }`}
            />
          ))}
        </div>

        {isLast ? (
          <div className="mt-5">
            <p className="mb-3 text-center text-sm font-medium text-zinc-700">
              {t.onboarding_guide_prompt}
            </p>
            <button
              type="button"
              onClick={goGuide}
              className="h-12 w-full rounded-xl bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800"
            >
              {t.onboarding_view_guide}
            </button>
            <button
              type="button"
              onClick={close}
              className="mt-2 h-11 w-full rounded-xl text-sm font-medium text-zinc-500 hover:bg-zinc-50"
            >
              {t.onboarding_later}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="mt-5 h-12 w-full rounded-xl bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {t.onboarding_next}
          </button>
        )}
      </div>
    </div>
  );
}
