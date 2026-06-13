"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/app/_components/ui/Button";
import { redirectToLogin } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";
import { useAuthUser } from "@/lib/useAuthUser";
import {
  requestPushNotifications,
  type PushPermissionOutcome,
} from "@/lib/requestPushNotifications";

/** 가이드 등에서 쓰는 알림 허용 버튼. */
export function EnableNotificationsButton() {
  const { t } = useLocale();
  const { user } = useAuthUser();
  const [status, setStatus] = useState<PushPermissionOutcome | "idle">("idle");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor-firebase/messaging").then(({ FirebaseMessaging }) =>
        FirebaseMessaging.checkPermissions().then(({ receive }) => {
          if (receive === "granted") setStatus("granted");
        }),
      );
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      setStatus("granted");
    }
  }, []);

  async function onEnable() {
    if (!user) {
      redirectToLogin(typeof window !== "undefined" ? window.location.pathname : undefined);
      return;
    }
    setLoading(true);
    try {
      setStatus(await requestPushNotifications(user));
    } finally {
      setLoading(false);
    }
  }

  const statusMessage =
    status === "denied"
      ? t.guide_noti_denied
      : status === "unsupported"
        ? t.guide_noti_unsupported
        : status === "login_required"
          ? t.guide_noti_login
          : null;

  return (
    <>
      <Button
        className="w-full px-4 py-3 text-sm font-medium"
        onClick={onEnable}
        disabled={loading || status === "granted"}
      >
        {loading
          ? t.guide_noti_enabling
          : status === "granted"
            ? t.guide_noti_granted
            : t.guide_noti_enable_btn}
      </Button>
      {statusMessage ? <p className="mt-2 text-xs text-zinc-600">{statusMessage}</p> : null}
    </>
  );
}
