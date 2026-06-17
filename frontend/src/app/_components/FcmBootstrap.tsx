"use client";

import { useEffect, useRef } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import type { User } from "firebase/auth";
import { useAuth } from "@/lib/AuthProvider";
import { registerDeviceToken } from "@/lib/api/push";
import { markNativePermissionsReady } from "@/lib/nativePermissions";
import { reportClientError } from "@/lib/api";
import { track } from "@/lib/analytics";

/** 백그라운드 복귀 직후 Play Services 미준비 시 Google Play 팝업이 뜨는 것을 줄이기 위한 대기 */
const COLD_START_TOKEN_DELAY_MS = 1500;
const RESUME_TOKEN_DELAY_MS = 2000;
const TOKEN_RETRY_DELAY_MS = 1500;
const TOKEN_MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureNotificationPermission(): Promise<boolean> {
  const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
  let { receive } = await FirebaseMessaging.checkPermissions();
  if (receive === "granted") return true;
  if (receive === "denied") return false;
  ({ receive } = await FirebaseMessaging.requestPermissions());
  return receive === "granted";
}

/** 위치 권한 팝업이 닫힐 때까지 대기 (허용/거부 모두 다음 단계로 진행) */
function requestLocationPermission(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve(),
      () => resolve(),
      { enableHighAccuracy: true, timeout: 120_000, maximumAge: Infinity },
    );
  });
}

export function FcmBootstrap() {
  const { user } = useAuth();
  const registeredRef = useRef<string | null>(null);

  // 네이티브: GPS 권한 → 알림 권한 순차 요청
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    async function requestSequentially() {
      try {
        await requestLocationPermission();
        if (!cancelled) {
          await ensureNotificationPermission();
        }
      } finally {
        markNativePermissionsReady();
      }
    }

    requestSequentially().catch((e: unknown) => {
      void reportClientError({
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        kind: "fcm_permission_failed",
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // 웹/iOS PWA: 웹 푸시 토큰 등록 (앱 복귀 시 토큰 재동기화).
  useEffect(() => {
    if (!user || Capacitor.isNativePlatform()) return;

    function sync() {
      void import("@/lib/webPush").then(({ registerWebPush }) => registerWebPush(user as User));
    }

    sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // uid에만 의존(상단 네이티브 effect와 동일 규칙)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // 로그인 후: FCM 토큰 등록 (콜드스타트·백그라운드 복귀 시 Play Services 준비 대기)
  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;

    let cancelled = false;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    let appListener: PluginListenerHandle | undefined;
    let tokenListenerAdded = false;

    async function fetchFcmTokenWithRetry(): Promise<string | null> {
      const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
      let lastError: unknown;
      for (let attempt = 0; attempt < TOKEN_MAX_ATTEMPTS; attempt++) {
        if (cancelled) return null;
        if (attempt > 0) await sleep(TOKEN_RETRY_DELAY_MS);
        try {
          const { token } = await FirebaseMessaging.getToken();
          if (token) return token;
        } catch (e) {
          lastError = e;
          console.warn("FCM getToken retry", attempt + 1, e);
        }
      }
      // 재시도 모두 실패 → 호출부(syncToken)에서 한 번에 기록하도록 throw
      if (lastError !== undefined) throw lastError;
      return null;
    }

    async function syncToken(initialDelayMs: number) {
      if (cancelled) return;
      if (initialDelayMs > 0) await sleep(initialDelayMs);
      if (cancelled) return;

      // FCM 토큰 취득 — Play Services 오류는 별도 집계
      let token: string | null = null;
      try {
        const granted = await ensureNotificationPermission();
        if (cancelled || !granted) return;

        token = await fetchFcmTokenWithRetry();
        if (cancelled || !token || token === registeredRef.current) return;
      } catch (e) {
        if (cancelled) return;
        // Play Services/FCM 초기화 실패 — 빈도·대상 유저 집계용으로 기록
        void reportClientError({
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
          kind: "fcm_play_services",
        });
        return;
      }

      // 서버 토큰 등록 — 일시적 네트워크 오류는 다음 앱 복귀 시 자동 재시도됨
      try {
        await registerDeviceToken(user as User, token, Capacitor.getPlatform());
        registeredRef.current = token;

        const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
        if (!tokenListenerAdded && !cancelled) {
          tokenListenerAdded = true;
          await FirebaseMessaging.addListener("tokenReceived", async ({ token: newToken }) => {
            if (!newToken || newToken === registeredRef.current) return;
            await registerDeviceToken(user as User, newToken, Capacitor.getPlatform());
            registeredRef.current = newToken;
          });
        }
      } catch {
        // 네트워크 오류 등 일시적 실패는 무시 — registeredRef가 null로 남으므로 복귀 시 재시도됨
      }
    }

    void syncToken(COLD_START_TOKEN_DELAY_MS);

    // 알림 탭 시 분석 이벤트 — 푸시 효과/복귀 측정 (cleanup의 removeAllListeners로 해제)
    void import("@capacitor-firebase/messaging").then(async ({ FirebaseMessaging }) => {
      if (cancelled) return;
      await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
        const data = event.notification?.data as Record<string, unknown> | undefined;
        const type = typeof data?.type === "string" ? data.type : "unknown";
        void track("push_opened", { type });
      });
    });

    void import("@capacitor/app").then(async ({ App }) => {
      appListener = await App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive || cancelled) return;
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
          // 이미 토큰이 등록됐으면 복귀 시 재요청하지 않는다 — Play Services 팝업 유발 방지(완화 ②)
          if (registeredRef.current) return;
          void syncToken(0);
        }, RESUME_TOKEN_DELAY_MS);
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(resumeTimer);
      void appListener?.remove();
      import("@capacitor-firebase/messaging").then(({ FirebaseMessaging }) => {
        FirebaseMessaging.removeAllListeners();
      });
    };
    // user 객체 식별자(uid)에만 의존해 재등록 — user 객체 자체는 동일 uid라도 매 렌더 바뀔 수 있어 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  return null;
}
