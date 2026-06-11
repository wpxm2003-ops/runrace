import type { Analytics } from "firebase/analytics";

/**
 * Firebase Analytics(웹 SDK) 이벤트 전송 헬퍼.
 * WebView 안에서 동작 — APK 재배포 없이 프론트 배포만으로 반영된다.
 * measurementId(NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) 미설정 시 조용히 무시(no-op).
 * 분석은 best-effort — 실패해도 앱 흐름을 막지 않는다.
 */
type EventParams = Record<string, string | number | boolean>;

let analyticsPromise: Promise<Analytics | null> | null = null;

function getAnalyticsInstance(): Promise<Analytics | null> {
  if (analyticsPromise) return analyticsPromise;
  analyticsPromise = (async () => {
    if (typeof window === "undefined") return null;
    if (!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) return null;
    const { isSupported, getAnalytics } = await import("firebase/analytics");
    if (!(await isSupported())) return null;
    const { firebaseApp } = await import("./firebase");
    return getAnalytics(firebaseApp);
  })().catch(() => null);
  return analyticsPromise;
}

export async function track(name: string, params?: EventParams): Promise<void> {
  try {
    const analytics = await getAnalyticsInstance();
    if (!analytics) return;
    const { logEvent } = await import("firebase/analytics");
    logEvent(analytics, name, params);
  } catch {
    // 무시
  }
}

/** 로그인 시 사용자 식별자 설정 — 이벤트를 유저 단위로 묶는다. */
export async function setAnalyticsUser(userId: string | null): Promise<void> {
  try {
    const analytics = await getAnalyticsInstance();
    if (!analytics) return;
    const { setUserId } = await import("firebase/analytics");
    setUserId(analytics, userId);
  } catch {
    // 무시
  }
}
