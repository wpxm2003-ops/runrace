"use client";

import { Suspense, useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithRedirect } from "firebase/auth";
import { useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import { syncBackendLogin } from "@/lib/api";
import {
  LOGIN_PENDING_KEY,
  OAUTH_REDIRECT_FAILED_KEY,
  buildLoginPageUrl,
  canOAuthRedirectFallback,
  isInAppBrowser,
  isPopupBlockedError,
  openInExternalBrowser,
  preferAuthRedirect,
  prepareOAuthRedirect,
  safeReturnPath,
} from "@/lib/authLogin";
import { nativeNavigate } from "@/lib/nativeNav";
import { signInWithGoogleApp } from "@/lib/nativeGoogleSignIn";
import { track, setAnalyticsUser } from "@/lib/analytics";
import { markLoggedIn } from "@/lib/AuthProvider";
import { useLocale } from "@/lib/i18n";

function toSignInErrorMessage(e: unknown, popupBlockedMsg: string): string {
  const msg = String(e);
  if (/popup|blocked|closed/i.test(msg)) return popupBlockedMsg;
  return msg;
}

function LoginContent() {
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("return"));
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [inAppHint, setInAppHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inApp = isInAppBrowser();

  useEffect(() => {
    if (sessionStorage.getItem(OAUTH_REDIRECT_FAILED_KEY)) {
      sessionStorage.removeItem(OAUTH_REDIRECT_FAILED_KEY);
      setError(t.login_popup_blocked);
    }
  }, [t.login_popup_blocked]);

  async function completeBackendLogin(user: Parameters<typeof syncBackendLogin>[0]) {
    await syncBackendLogin(user);
    void setAnalyticsUser(user.uid);
    void track("login", { method: "google" });
    nativeNavigate(returnTo);
  }

  function beginRedirectFlow(): boolean {
    if (!preferAuthRedirect()) return false;
    prepareOAuthRedirect(returnTo);
    return true;
  }

  async function handleOpenExternalBrowser() {
    setError(null);
    setInAppHint(null);
    const method = await openInExternalBrowser(buildLoginPageUrl(returnTo));
    if (method === "copy") setInAppHint(t.login_inapp_url_copied);
  }

  async function signInGoogle() {
    setError(null);
    if (inApp) { setError(t.login_inapp_message); return; }
    setBusy(true);
    let redirecting = false;
    try {
      if (beginRedirectFlow()) {
        redirecting = true;
        await signInWithRedirect(auth, new GoogleAuthProvider());
        return;
      }
      const cred = await signInWithGoogleApp();
      markLoggedIn(); // 페이지 이동 전에 플래그 세팅 → 다음 페이지 redirect 차단
      await completeBackendLogin(cred.user);
    } catch (e) {
      if (isPopupBlockedError(e)) {
        if (!canOAuthRedirectFallback()) {
          setError(t.login_popup_blocked);
          sessionStorage.removeItem(LOGIN_PENDING_KEY);
          return;
        }
        redirecting = true;
        prepareOAuthRedirect(returnTo);
        await signInWithRedirect(auth, new GoogleAuthProvider());
        return;
      }
      setError(toSignInErrorMessage(e, t.login_popup_blocked));
      sessionStorage.removeItem(LOGIN_PENDING_KEY);
    } finally {
      if (!redirecting) setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{t.login_headline}</h1>
        <p className="mt-2 text-sm text-zinc-600">{t.login_desc}</p>

        {inApp && (
          <div className="mt-4 space-y-2">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t.login_inapp_message}
            </p>
            {inAppHint && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{inAppHint}</p>
            )}
            <button
              type="button"
              onClick={handleOpenExternalBrowser}
              className="h-11 w-full rounded-xl border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
            >
              {t.login_inapp_open_browser}
            </button>
          </div>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={signInGoogle}
            disabled={busy || inApp}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {busy ? t.login_busy : t.login_google}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
          <p className="text-sm text-zinc-500">Loading...</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
