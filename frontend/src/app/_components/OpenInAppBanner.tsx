"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { buildAppIntentUrl } from "@/lib/deepLink";
import { useLocale } from "@/lib/i18n";

/**
 * 모바일 브라우저(특히 주소창 직접 입력·북마크 진입)에서 접속한 사용자에게
 * 설치된 앱으로 열도록 유도하는 배너.
 *
 * 왜 배너가 필요한가:
 *  - Android App Links는 "사용자가 직접 친 URL/북마크"는 OS 정책상 가로채지 않는다.
 *    그래서 브라우저로 들어온 접속자는 자동으로 앱이 열리지 않는다 → 배너로 유도.
 *  - 다른 앱(카톡 등)에서 링크를 누른 경우는 App Links가 이미 앱을 열므로 여기 영향 없음.
 *
 * 동작:
 *  - 우리 앱 웹뷰(Capacitor)·비안드로이드·카톡 인앱브라우저에서는 노출하지 않는다.
 *  - "앱으로 열기" → intent:// 로 앱 실행 시도, 미설치 시 Play Store 폴백.
 *  - 닫으면 일정 기간(localStorage) 다시 띄우지 않는다.
 */
const DISMISS_KEY = "rr_app_banner_dismissed_at";
const DISMISS_DAYS = 7;
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.runrace.app";

export function OpenInAppBanner() {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return; // 우리 앱 웹뷰 제외
    if (typeof navigator === "undefined" || typeof window === "undefined") return;

    const ua = navigator.userAgent || "";
    if (!/Android/i.test(ua)) return; // 현재 앱은 Android만 제공
    if (/KAKAOTALK/i.test(ua)) return; // 카톡 인앱은 KakaoInAppRedirect가 처리

    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86_400_000) {
        return;
      }
    } catch {
      /* localStorage 불가 시 그대로 노출 */
    }

    setVisible(true);
  }, []);

  if (!visible) return null;

  const openInApp = () => {
    const { href } = window.location;
    window.location.href = buildAppIntentUrl(encodeURIComponent(PLAY_STORE_URL || href));
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* 무시 */
    }
    setVisible(false);
  };

  return (
    <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs sm:px-4">
      <img
        src="/icons/icon-192.webp"
        alt="RunRace"
        className="h-7 w-7 flex-none rounded-lg"
      />
      <span className="min-w-0 flex-1 text-[12px] leading-snug text-muted">{t.appbanner_text}</span>
      <button
        type="button"
        onClick={openInApp}
        className="flex min-h-9 flex-none items-center rounded-pill bg-night px-3 text-[11px] font-bold text-white"
      >
        {t.appbanner_open}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t.appbanner_close}
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-muted hover:bg-panel-muted hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
