"use client";

import { Suspense, useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithRedirect } from "firebase/auth";
import { useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import { syncBackendLogin } from "@/lib/api";
import {
  IN_APP_LOGIN_MESSAGE,
  IN_APP_OPEN_BROWSER_LABEL,
  IN_APP_URL_COPIED_MESSAGE,
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
    if (method === "copy") setInAppHint(IN_APP_URL_COPIED_MESSAGE);
  }

  async function signInGoogle() {
    setError(null);
    if (inApp) { setError(IN_APP_LOGIN_MESSAGE); return; }
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
              {IN_APP_LOGIN_MESSAGE}
            </p>
            {inAppHint && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{inAppHint}</p>
            )}
            <button
              type="button"
              onClick={handleOpenExternalBrowser}
              className="h-11 w-full rounded-xl border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
            >
              {IN_APP_OPEN_BROWSER_LABEL}
            </button>
          </div>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}

        <div className="mt-6">
          <button
            type="button"
            disabled={busy || inApp}
            onClick={signInGoogle}
            className="h-11 w-full rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
          >
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
