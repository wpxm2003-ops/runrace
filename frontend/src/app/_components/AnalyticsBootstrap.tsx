"use client";

import { useEffect, useRef } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/lib/AuthProvider";
import { initAnalytics, setAnalyticsUser } from "@/lib/analytics";
import { pingDailyActivity } from "@/lib/activityPing";
import { detectClientPlatform } from "@/lib/clientPlatform";

/**
 * 재방문 측정 부팅 — AppShell에 한 번 마운트한다.
 *
 * 1. 앱 부팅 때 GA4를 초기화한다 → 이벤트 없이 나간 방문도 page_view·session_start가 남고,
 *    사용자 속성 platform(android_app | web | ios_web)이 붙는다.
 * 2. 로그인 상태가 정해지면(자동 로그인 복원 포함) GA4 사용자 ID를 맞춘다. 로그아웃이면 해제.
 * 3. 로그인 사용자의 일일 활성 핑 — 부팅 + 포그라운드 복귀(앱 appStateChange, 웹
 *    visibilitychange) 때 부르고, 실제 전송은 기기 현지 날짜로 하루 한 번(activityPing).
 */
export function AnalyticsBootstrap() {
  const { user, loading } = useAuth();
  /** 마지막으로 GA4에 넘긴 사용자 ID. 같은 값이면 다시 보내지 않는다. */
  const appliedUidRef = useRef<string | null>(null);

  useEffect(() => {
    void initAnalytics();
  }, []);

  useEffect(() => {
    if (loading) return;
    const uid = user?.uid ?? null;
    if (appliedUidRef.current === uid) return;
    appliedUidRef.current = uid;
    void setAnalyticsUser(uid);
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    const platform = detectClientPlatform();
    const ping = () => {
      void pingDailyActivity(user, platform);
    };
    ping();

    const onVisibility = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // WebView가 visibilitychange를 놓치는 기기를 위해 네이티브 복귀 이벤트도 함께 듣는다.
    // 두 번 불려도 activityPing이 같은 날 한 번으로 거른다.
    let cancelled = false;
    let appListener: PluginListenerHandle | undefined;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app").then(async ({ App }) => {
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) ping();
        });
        if (cancelled) void handle.remove();
        else appListener = handle;
      });
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void appListener?.remove();
    };
  }, [user]);

  return null;
}
