"use client";

import { Suspense, useState } from "react";
import { GoogleAuthProvider, signInWithRedirect } from "firebase/auth";
import { useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import { syncBackendLogin } from "@/lib/api";
import {
  IN_APP_LOGIN_MESSAGE,
  LOGIN_PENDING_KEY,
  LOGIN_RETURN_KEY,
  isInAppBrowser,
  preferAuthRedirect,
  safeReturnPath,
} from "@/lib/authLogin";
import { nativeNavigate } from "@/lib/nativeNav";
import { signInWithGoogleApp } from "@/lib/nativeGoogleSignIn";
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
  const [busy, setBusy] = useState(false);
  const inApp = isInAppBrowser();

  async function completeBackendLogin(user: Parameters<typeof syncBackendLogin>[0]) {
    await syncBackendLogin(user);
    nativeNavigate(returnTo);
  }

  function beginRedirectFlow(): boolean {
    if (!preferAuthRedirect()) return false;
    sessionStorage.setItem(LOGIN_RETURN_KEY, returnTo);
    sessionStorage.setItem(LOGIN_PENDING_KEY, "1");
    return true;
  }

  async function signInGoogle() {
    setError(null);
    if (inApp) { setError(IN_APP_LOGIN_MESSAGE); return; }
    setBusy(true);
    try {
      if (beginRedirectFlow()) {
        await signInWithRedirect(auth, new GoogleAuthProvider());
        return;
      }
      const cred = await signInWithGoogleApp();
      await completeBackendLogin(cred.user);
    } catch (e) {
      setError(toSignInErrorMessage(e, t.login_popup_blocked));
      sessionStorage.removeItem(LOGIN_PENDING_KEY);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{t.login_headline}</h1>
        <p className="mt-2 text-sm text-zinc-600">{t.login_desc}</p>

        {inApp && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {IN_APP_LOGIN_MESSAGE}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}

        <div className="mt-6">
          <button
            type="button"
            disabled={busy}
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
