"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
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
    const { host, pathname, search, href } = window.location;
    const fallback = encodeURIComponent(PLAY_STORE_URL || href);
    const intentUrl =
      `intent://${host}${pathname}${search}` +
      `#Intent;scheme=https;package=com.runrace.app;` +
      `S.browser_fallback_url=${fallback};end`;
    window.location.href = intentUrl;
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
    <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 text-sm">
      <img
        src="/icons/icon-192.webp"
        alt="RunRace"
        className="h-8 w-8 flex-none rounded-lg"
      />
      <span className="min-w-0 flex-1 text-zinc-700">{t.appbanner_text}</span>
      <button
        type="button"
        onClick={openInApp}
        className="flex-none rounded-full bg-zinc-900 px-3 py-1.5 font-medium text-white"
      >
        {t.appbanner_open}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t.appbanner_close}
        className="flex-none px-1 text-zinc-400"
      >
        ✕
      </button>
    </div>
  );
}
