"use client";

import { AuthRedirectHandler } from "./AuthRedirectHandler";
import { ClientErrorReporter } from "./ClientErrorReporter";
import { ErrorBoundary } from "./ErrorBoundary";
import { NativeNavBootstrap } from "./NativeNavBootstrap";
import { KakaoOAuthBootstrap } from "./KakaoOAuthBootstrap";
import { DeepLinkBootstrap } from "./DeepLinkBootstrap";
import { KakaoInAppRedirect } from "./KakaoInAppRedirect";
import { OpenInAppBanner } from "./OpenInAppBanner";
import { BottomNav } from "./BottomNav";
import { ConfirmProvider } from "./ConfirmProvider";
import { SiteHeader } from "./SiteHeader";
import { AuthProvider } from "@/lib/AuthProvider";
import { LocaleProvider } from "@/lib/i18n";
import { UnitProvider } from "@/lib/UnitContext";
import { WorkoutSessionProvider } from "@/lib/WorkoutSessionProvider";
import { isNativeApp } from "@/lib/nativeNav";
import { FcmBootstrap } from "./FcmBootstrap";
import { LanguageSync } from "./LanguageSync";
import { NavProgressProvider } from "./NavProgressProvider";
import { SWRConfig, useSWRConfig } from "swr";
import { createSwrCacheProvider } from "@/lib/swrCacheProvider";
import { bindAppMutate } from "@/lib/swrMutate";
import { Toaster } from "sonner";
import { useEffect } from "react";

/**
 * SWRConfig(provider) 안쪽 캐시의 mutate를 전역 invalidate* 헬퍼(appMutate)에 연결한다.
 * effect가 아닌 렌더 시점에 주입하는 이유: 형제·자식들의 effect보다 먼저 실행돼
 * 마운트 직후의 무효화도 앱 캐시에 닿는다. 같은 함수 참조의 재할당이라 멱등하다.
 */
function SwrMutateBinder() {
  bindAppMutate(useSWRConfig().mutate);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!isNativeApp()) return;

    const isEditableTarget = (target: EventTarget | null): target is HTMLElement => {
      return target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
    };

    const preventLongPressMenu = (event: Event) => {
      if (isEditableTarget(event.target)) {
        event.preventDefault();
      }
    };

    const collapseEditableSelection = () => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const end = active.selectionEnd ?? active.value.length;
        if ((active.selectionStart ?? end) !== end) {
          active.setSelectionRange(end, end);
        }
      }
    };

    document.addEventListener("contextmenu", preventLongPressMenu, true);
    document.addEventListener("selectstart", preventLongPressMenu, true);
    document.addEventListener("selectionchange", collapseEditableSelection);

    return () => {
      document.removeEventListener("contextmenu", preventLongPressMenu, true);
      document.removeEventListener("selectstart", preventLongPressMenu, true);
      document.removeEventListener("selectionchange", collapseEditableSelection);
    };
  }, []);

  return (
    <SWRConfig value={{ provider: createSwrCacheProvider }}>
    <SwrMutateBinder />
    <AuthProvider>
    <LocaleProvider>
    <UnitProvider>
    <FcmBootstrap />
    <LanguageSync />
    <WorkoutSessionProvider>
    <ConfirmProvider>
    <NavProgressProvider>
      <Toaster position="top-center" richColors duration={2500} />
      <ClientErrorReporter />
      <AuthRedirectHandler />
      <NativeNavBootstrap />
      <KakaoOAuthBootstrap />
      <DeepLinkBootstrap />
      <KakaoInAppRedirect />
      <div className="flex min-h-0 min-h-dvh flex-1 flex-col bg-zinc-50 text-zinc-900">
        <OpenInAppBanner />
        <SiteHeader />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))]">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <BottomNav />
      </div>
    </NavProgressProvider>
    </ConfirmProvider>
    </WorkoutSessionProvider>
    </UnitProvider>
    </LocaleProvider>
    </AuthProvider>
    </SWRConfig>
  );
}
