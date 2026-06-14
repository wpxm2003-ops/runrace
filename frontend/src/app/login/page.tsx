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
import { Button } from "@/app/_components/ui/Button";
import { startKakaoLogin } from "@/lib/kakaoAuth";

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
  const [kakaoBusy, setKakaoBusy] = useState(false);
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

  async function signInKakao() {
    setError(null);
    setKakaoBusy(true);
    try {
      await startKakaoLogin(returnTo);
    } catch (e) {
      setError(String(e));
      setKakaoBusy(false);
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
          <Button
            variant="primary"
            disabled={busy || kakaoBusy || inApp}
            onClick={signInGoogle}
            className="h-11 w-full disabled:opacity-50"
          >
            {busy ? t.login_busy : t.login_google}
          </Button>
          <button
            type="button"
            onClick={signInKakao}
            disabled={busy || kakaoBusy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-sm font-medium text-[#191919] hover:bg-[#F5DC00] disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.748 1.573 5.168 3.953 6.627l-.953 3.554a.25.25 0 0 0 .375.275L9.9 18.986c.693.1 1.4.154 2.1.154 5.523 0 10-3.477 10-7.8S17.523 3 12 3Z" />
            </svg>
            {kakaoBusy ? t.login_busy : t.login_kakao}
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
