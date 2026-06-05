"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/lib/AuthProvider";
import { registerDeviceToken } from "@/lib/api/push";

export function FcmBootstrap() {
  const { user } = useAuth();
  const registeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;

    async function init() {
      const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

      // 알림 권한 요청
      const { receive } = await FirebaseMessaging.requestPermissions();
      if (receive !== "granted") return;

      // FCM 토큰 발급
      const { token } = await FirebaseMessaging.getToken();
      if (!token || token === registeredRef.current) return;

      // 백엔드에 토큰 등록
      await registerDeviceToken(user!, token, Capacitor.getPlatform());
      registeredRef.current = token;

      // 토큰 갱신 시 재등록
      await FirebaseMessaging.addListener("tokenReceived", async ({ token: newToken }) => {
        if (!newToken || newToken === registeredRef.current) return;
        await registerDeviceToken(user!, newToken, Capacitor.getPlatform());
        registeredRef.current = newToken;
      });
    }

    init().catch(console.error);

    return () => {
      import("@capacitor-firebase/messaging").then(({ FirebaseMessaging }) => {
        FirebaseMessaging.removeAllListeners();
      });
    };
  }, [user?.uid]);

  return null;
}
