"use client";

import { processKakaoOAuthReturn } from "@/lib/kakaoAuth";
import { useAppUrlOpen } from "@/lib/useAppUrlOpen";

/** 콜드 스타트에서 같은 launch URL 재처리 방지(풀페이지 리로드 루프 방지). */
const LAUNCH_KEY = "rr_kakao_launch_handled";

/** 훅 계약이 (url) => void — OAuth 처리 결과는 여기서 기다리지 않는다. */
const handleKakaoReturn = (url: string): void => {
  void processKakaoOAuthReturn(url);
};

/** 네이티브 앱 OAuth 콜백(com.runrace.app://kakao/callback) 수신 */
export function KakaoOAuthBootstrap() {
  useAppUrlOpen(LAUNCH_KEY, handleKakaoReturn);
  return null;
}
