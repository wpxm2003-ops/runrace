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
import { SWRConfig } from "swr";
import { createSwrCacheProvider } from "@/lib/swrCacheProvider";
import { Toaster } from "sonner";
import { useEffect } from "react";

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
