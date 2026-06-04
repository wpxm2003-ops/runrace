"use client";

import { AuthRedirectHandler } from "./AuthRedirectHandler";
import { ClientErrorReporter } from "./ClientErrorReporter";
import { ErrorBoundary } from "./ErrorBoundary";
import { NativeNavBootstrap } from "./NativeNavBootstrap";
import { BottomNav } from "./BottomNav";
import { ConfirmProvider } from "./ConfirmProvider";
import { SiteHeader } from "./SiteHeader";
import { AuthProvider } from "@/lib/AuthProvider";
import { LocaleProvider } from "@/lib/i18n";

/** 하단 탭 네비 높이 */
export const BOTTOM_NAV_HEIGHT = "4rem";

/** 고정 액션 버튼(참여하기 등)과 하단 탭 사이 간격 */
export const BOTTOM_NAV_GAP = "1rem";

export const BOTTOM_NAV_OFFSET = BOTTOM_NAV_HEIGHT;

/** 참여하기 등 고정 바의 bottom 값 */
export const FIXED_ACTION_BOTTOM = `calc(${BOTTOM_NAV_HEIGHT} + ${BOTTOM_NAV_GAP} + env(safe-area-inset-bottom))`;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
    <LocaleProvider>
    <ConfirmProvider>
      <ClientErrorReporter />
      <AuthRedirectHandler />
      <NativeNavBootstrap />
      <div className="flex min-h-0 min-h-dvh flex-1 flex-col bg-zinc-50 text-zinc-900">
        <SiteHeader />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))]">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <BottomNav />
      </div>
    </ConfirmProvider>
    </LocaleProvider>
    </AuthProvider>
  );
}
