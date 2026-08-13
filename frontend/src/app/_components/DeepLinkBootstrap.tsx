"use client";

import { processIncomingDeepLink } from "@/lib/deepLink";
import { useAppUrlOpen } from "@/lib/useAppUrlOpen";

/** 콜드 스타트에서 같은 launch URL을 재처리하지 않도록 표시(풀페이지 리로드 루프 방지). */
const LAUNCH_KEY = "rr_launch_handled";

/**
 * App Links(https://runrace.co.kr/...)로 앱에 들어온 외부 링크를 SPA 경로로 이동.
 * 카카오톡 공유 링크 등을 설치된 앱에서 바로 연다.
 */
export function DeepLinkBootstrap() {
  useAppUrlOpen(LAUNCH_KEY, processIncomingDeepLink);
  return null;
}
