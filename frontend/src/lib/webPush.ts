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
    onMessage(messaging, (payload) => {
      if (Notification.permission !== "granted") return;
      const n = payload.notification;
      if (!n) return;
      new Notification(n.title || "RunRace", {
        body: n.body || "",
        data: payload.data,
      });
    });
  });
}

/**
 * 웹/iOS PWA 푸시 토큰을 발급받아 서버에 등록한다.
 * iOS는 "홈 화면에 추가"된 PWA에서만 동작한다.
 */
export async function registerWebPush(user: User): Promise<void> {
  if (!VAPID_KEY) return;
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("Notification" in window)
  ) {
    return;
  }
  try {
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return;
    if (Notification.permission === "denied") return;
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;

    const messaging = getMessaging(firebaseApp);
    hookForegroundMessaging(messaging);

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (token) await registerDeviceToken(user, token, webPlatform());
  } catch (e) {
    void reportClientError({
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      kind: "web_push_register_failed",
    });
  }
}
