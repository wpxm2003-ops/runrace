"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/lib/AuthProvider";
import { registerDeviceToken } from "@/lib/api/push";

export function FcmBootstrap() {
  const { user } = useAuth();
  const registeredRef = useRef<string | null>(null);
  const [notifGranted, setNotifGranted] = useState(false);

  // GPS와 같이 앱 시작 시 알림 권한 요청 (로그인 불필요)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    async function requestPermission() {
      const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
      const { receive } = await FirebaseMessaging.requestPermissions();
      setNotifGranted(receive === "granted");
    }

    requestPermission().catch(console.error);
  }, []);

  // 로그인 후 FCM 토큰 등록
  useEffect(() => {
    if (!user || !notifGranted || !Capacitor.isNativePlatform()) return;

    async function register() {
      const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

      const { token } = await FirebaseMessaging.getToken();
      if (!token || token === registeredRef.current) return;

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
      import("@capacitor-firebase/messaging").then(({ FirebaseMessaging }) => {
        FirebaseMessaging.removeAllListeners();
      });
    };
  }, [user?.uid, notifGranted]);

  return null;
}
