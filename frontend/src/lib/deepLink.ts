import { Capacitor } from "@capacitor/core";
import { nativeNavigate } from "./nativeNav";

/** 앱이 가로채는 호스트 (App Links). */
const APP_HOSTS = new Set(["runrace.co.kr", "www.runrace.co.kr"]);

/**
 * 외부(카카오톡 공유 등)에서 App Links로 앱에 들어온 https URL을 SPA 경로로 이동시킨다.
 * - 카카오 OAuth 콜백은 KakaoOAuthBootstrap이 처리하므로 여기선 건너뛴다.
 * - 공유용 OG 프록시 경로(/api/share/...)는 실제 상세 페이지로 매핑한다.
 */
export function processIncomingDeepLink(url: string): boolean {
  if (!Capacitor.isNativePlatform()) return false;

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (!APP_HOSTS.has(u.hostname)) return false;
  if (u.pathname.startsWith("/kakao/callback")) return false; // Kakao 핸들러 소관

  nativeNavigate(mapToInternalPath(u.pathname, u.search));
  return true;
}

function mapToInternalPath(pathname: string, search: string): string {
  // 공유 링크의 OG 프록시 경로 → 실제 상세 페이지
  const shareChallenge = pathname.match(/^\/api\/share\/challenges\/(\d+)/);
  if (shareChallenge) return `/challenges/${shareChallenge[1]}`;
  return pathname + search;
}
