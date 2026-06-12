"use client";

import { useEffect, useState } from "react";
import { isIosWeb } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";

const DISMISS_KEY = "ios_install_prompt_dismissed";

/** 이미 홈 화면 PWA로 실행 중인지. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari 전용 플래그
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * iOS 웹(아이폰/아이패드) 사용자에게 "홈 화면에 추가"를 안내한다.
 * iOS는 설치 배너가 없고, 홈 화면에 추가해야 전체화면 실행 + 웹 푸시가 가능하다.
 * 네이티브 앱·이미 설치된 PWA·기타 플랫폼에서는 표시하지 않는다.
 */
export function IosInstallPrompt() {
  const { t } = useLocale();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (
      isIosWeb() &&
      !isStandalone() &&
      !localStorage.getItem(DISMISS_KEY)
    ) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3">
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-lg">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-900">{t.ios_install_title}</div>
          <p className="mt-0.5 text-xs text-zinc-600">{t.ios_install_desc}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100"
        >
          {t.ios_install_dismiss}
        </button>
      </div>
    </div>
  );
}
