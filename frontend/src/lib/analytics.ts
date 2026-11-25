import type { Analytics } from "firebase/analytics";
import { detectClientPlatform } from "./clientPlatform";

/**
 * Firebase Analytics(웹 SDK) 이벤트 전송 헬퍼.
 * WebView 안에서 동작 — APK 재배포 없이 프론트 배포만으로 반영된다.
 * measurementId(NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) 미설정 시 조용히 무시(no-op).
 * 분석은 best-effort — 실패해도 앱 흐름을 막지 않는다.
 *
 * 이벤트 목록·파라미터·발생 위치는 docs/analytics-events.md에 정리한다.
 */
type EventParams = Record<string, string | number | boolean>;

let analyticsPromise: Promise<Analytics | null> | null = null;

function getAnalyticsInstance(): Promise<Analytics | null> {
  if (analyticsPromise) return analyticsPromise;
  analyticsPromise = (async () => {
    if (typeof window === "undefined") return null;
    if (!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) return null;
    const { isSupported, initializeAnalytics, getAnalytics, setUserProperties } =
      await import("firebase/analytics");
    if (!(await isSupported())) return null;
    const { firebaseApp } = await import("./firebase");
    // 초기화 때 보내는 첫 config(= 자동 page_view·session_start)에 platform을 실어
    // 첫 이벤트부터 앱/웹 구분이 붙게 한다. 사용자 속성은 이후 이벤트에도 유지된다.
    const userProperties = { platform: detectClientPlatform() };
    try {
      return initializeAnalytics(firebaseApp, { config: { user_properties: userProperties } });
    } catch {
      // 이미 다른 옵션으로 초기화됐으면(HMR 등) 기존 인스턴스에 속성만 덧붙인다.
      const analytics = getAnalytics(firebaseApp);
      setUserProperties(analytics, userProperties);
      return analytics;
    }
  })().catch(() => null);
  return analyticsPromise;
}

/**
 * 앱 부팅 때 한 번 호출한다(AnalyticsBootstrap). 예전에는 첫 track() 호출 때야 초기화돼서,
 * 앱만 열고 이벤트 없이 나간 방문은 page_view·session_start가 없어 DAU에서 빠졌다.
 */
export async function initAnalytics(): Promise<void> {
  await getAnalyticsInstance();
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

/** record_saved 트래킹용 거리 버킷. 경계 변경 시 한곳만 고치면 된다. */
export function distanceBucket(distanceKm: number): string {
  return distanceKm < 1 ? "under_1km" : distanceKm < 3 ? "1_3km" : distanceKm < 5 ? "3_5km" : "over_5km";
}

/**
 * 사용자 식별자 설정 — 이벤트를 유저 단위로 묶는다(Firebase UID). 로그인 순간뿐 아니라
 * 자동 로그인으로 세션이 복원될 때도(AnalyticsBootstrap) 호출되고, 로그아웃이면 null.
 */
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
