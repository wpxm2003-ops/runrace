"use client";

import { useCallback, useEffect, useState } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { checkNotificationPermission, type NotificationPermissionState } from "./pushPermission";

/**
 * 현재 알림 권한. 마운트할 때와 앱으로 돌아올 때(휴대폰 설정에서 켜고 돌아온 경우) 다시 확인한다.
 * 확인 전에는 null.
 */
export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermissionState | null>(null);

  const refresh = useCallback(async (): Promise<NotificationPermissionState> => {
    const next = await checkNotificationPermission().catch(() => "unsupported" as const);
    setPermission(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    let handle: PluginListenerHandle | undefined;
    void import("@capacitor/app").then(async ({ App }) => {
      const listener = await App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void refresh();
      });
      if (cancelled) void listener.remove();
      else handle = listener;
    });
    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, [refresh]);

  return { permission, setPermission, refresh };
}
