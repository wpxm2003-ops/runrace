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
import { UnitProvider } from "@/lib/UnitContext";
import { WorkoutSessionProvider } from "@/lib/WorkoutSessionProvider";
import { FcmBootstrap } from "./FcmBootstrap";
import { IosInstallPrompt } from "./IosInstallPrompt";
import { LanguageSync } from "./LanguageSync";
import { NavProgressProvider } from "./NavProgressProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
    <LocaleProvider>
    <UnitProvider>
    <FcmBootstrap />
    <LanguageSync />
    <WorkoutSessionProvider>
    <ConfirmProvider>
    <NavProgressProvider>
      <ClientErrorReporter />
      <AuthRedirectHandler />
      <NativeNavBootstrap />
      <div className="flex min-h-0 min-h-dvh flex-1 flex-col bg-zinc-50 text-zinc-900">
        <SiteHeader />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))]">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <BottomNav />
        <IosInstallPrompt />
      </div>
    </NavProgressProvider>
    </ConfirmProvider>
    </WorkoutSessionProvider>
    </UnitProvider>
    </LocaleProvider>
    </AuthProvider>
  );
}
