"use client";

import { useEffect } from "react";
import { useLocale } from "@/lib/i18n";
import { isCrewAvailable, isLocaleResolved } from "@/lib/crewAccess";
import { nativeNavigate } from "@/lib/nativeNav";

/**
 * 크루 화면 진입 가드 — 한국어 사용자에게만 공개한다(근거는 {@link isCrewAvailable}).
 *
 * 홈 메뉴에서 항목을 숨기는 것만으로는 부족하다: 북마크·딥링크·공유 링크·뒤로가기로
 * 직접 들어올 수 있고, 크루 화면은 지역 필터·정기런 안내가 한국 기준이라 그대로 노출된다.
 * 라우트 진입점 한 곳(crew/layout)에서 막아 하위 7개 페이지를 모두 덮는다.
 */
export function CrewLocaleGate({ children }: { children: React.ReactNode }) {
  const { locale, localeSource } = useLocale();
  const resolved = isLocaleResolved(localeSource);
  const allowed = isCrewAvailable(locale);

  useEffect(() => {
    if (!resolved || allowed) return;
    nativeNavigate("/", { replace: true });
  }, [resolved, allowed]);

  // 확정 전에는 그대로 렌더한다. 정적 내보내기라 첫 렌더는 하이드레이션을 맞추려 항상
  // 한국어 기준이고(LocaleProvider), 여기서 보류하면 사용자 대다수인 ko 쪽이 크루 화면마다
  // 빈 프레임을 본다 — 앱의 다른 화면들도 한 프레임 뒤 언어가 확정되는 동작이라 그쪽에 맞춘다.
  if (resolved && !allowed) return null;
  return <>{children}</>;
}
