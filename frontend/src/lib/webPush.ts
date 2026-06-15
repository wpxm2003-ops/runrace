import type { User } from "firebase/auth";
import { firebaseApp } from "./firebase";
import { registerDeviceToken } from "./api/push";
import { reportClientError } from "./api";
import { webPlatform } from "./nativeNav";

/**
 * 웹 푸시 VAPID 공개키 — Firebase 콘솔 > 클라우드 메시징 > 웹 푸시 인증서.
 */
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

let foregroundHooked = false;

function hookForegroundMessaging(messaging: import("firebase/messaging").Messaging): void {
  if (foregroundHooked) return;
  foregroundHooked = true;
  void import("firebase/messaging").then(({ onMessage }) => {
    onMessage(messaging, async (payload) => {
      if (Notification.permission !== "granted") return;
      const n = payload.notification;
      const data = payload.data ?? {};
      const title = n?.title || data.title || "RunRace";
      const body = n?.body || data.body || "";
      // iOS PWA는 new Notification() 생성자를 지원하지 않는다 → 서비스워커로만 표시.
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, { body, data });
      } else if ("Notification" in window) {
        try {
          new Notification(title, { body, data });
        } catch {
          // iOS 등 생성자 미지원 환경 — SW가 없으면 표시 생략
        }
      }
    });
  });
}

export type PushRegisterResult = "granted" | "denied" | "unsupported";

/**
 * 웹/iOS PWA 푸시 토큰을 발급받아 서버에 등록한다.
 * iOS는 "홈 화면에 추가"된 PWA에서만 동작한다.
 */
export async function registerWebPush(user: User): Promise<PushRegisterResult> {
  if (!VAPID_KEY) return "unsupported";
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  try {
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return "unsupported";
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return "denied";
    }

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;

    const messaging = getMessaging(firebaseApp);
    hookForegroundMessaging(messaging);

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (token) {
      await registerDeviceToken(user, token, webPlatform());
      return "granted";
    }
    return "denied";
  } catch (e) {
    void reportClientError({
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      kind: "web_push_register_failed",
    });
    return "denied";
  }
}
