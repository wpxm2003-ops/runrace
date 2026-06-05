"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/lib/AuthProvider";
import { registerDeviceToken } from "@/lib/api/push";
import { markNativePermissionsReady } from "@/lib/nativePermissions";

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

    requestSequentially().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, []);

  // 로그인 후: 미허용이면 재요청 → FCM 토큰 등록
  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;

    let cancelled = false;

    async function register() {
      const granted = await ensureNotificationPermission();
      if (cancelled || !granted) return;

      const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

      const { token } = await FirebaseMessaging.getToken();
      if (cancelled || !token || token === registeredRef.current) return;

      await registerDeviceToken(user!, token, Capacitor.getPlatform());
      registeredRef.current = token;

      await FirebaseMessaging.addListener("tokenReceived", async ({ token: newToken }) => {
        if (!newToken || newToken === registeredRef.current) return;
        await registerDeviceToken(user!, newToken, Capacitor.getPlatform());
        registeredRef.current = newToken;
      });
    }

    register().catch(console.error);

    return () => {
      cancelled = true;
      import("@capacitor-firebase/messaging").then(({ FirebaseMessaging }) => {
        FirebaseMessaging.removeAllListeners();
      });
    };
  }, [user?.uid]);

  return null;
}
