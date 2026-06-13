import { Capacitor } from "@capacitor/core";
import type { User } from "firebase/auth";
import { registerDeviceToken } from "./api/push";
import { registerWebPush } from "./webPush";

export type PushPermissionOutcome = "granted" | "denied" | "unsupported" | "login_required";

/** 버튼 클릭 시 OS 권한 팝업을 요청하고 토큰을 등록한다. */
export async function requestPushNotifications(
  user: User | null,
): Promise<PushPermissionOutcome> {
  if (!user) return "login_required";

  if (Capacitor.isNativePlatform()) {
    try {
      const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
      const { receive: current } = await FirebaseMessaging.checkPermissions();
      if (current !== "granted") {
        const { receive } = await FirebaseMessaging.requestPermissions();
        if (receive !== "granted") return "denied";
      }
      const { token } = await FirebaseMessaging.getToken();
      if (!token) return "denied";
      await registerDeviceToken(user, token, Capacitor.getPlatform());
      return "granted";
    } catch {
      return "denied";
    }
  }

  return registerWebPush(user);
}
