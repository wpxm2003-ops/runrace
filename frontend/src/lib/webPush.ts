import type { User } from "firebase/auth";
import { firebaseApp } from "./firebase";
import { registerDeviceToken } from "./api/push";

/**
 * 웹 푸시 VAPID 공개키 — Firebase 콘솔 > 클라우드 메시징 > 웹 푸시 인증서.
 * 미설정 시 웹 푸시는 전체 비활성(no-op). iOS PWA 푸시 활성화하려면:
 *   NEXT_PUBLIC_FIREBASE_VAPID_KEY, NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID 를 env에 추가.
 */
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/**
 * 웹/iOS PWA 푸시 토큰을 발급받아 서버에 등록한다.
 * - VAPID 키·지원 환경이 없으면 조용히 no-op(비활성 스캐폴딩).
 * - iOS는 "홈 화면에 추가"된 PWA에서만, 그리고 권한 요청은 사용자 제스처가 있어야 실제로 동작한다.
 */
export async function registerWebPush(user: User): Promise<void> {
  if (!VAPID_KEY) return; // 설정 전 — 비활성
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
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (token) await registerDeviceToken(user, token, "web");
  } catch {
    // 미지원·권한 거부·설정 미비 — 무시
  }
}
