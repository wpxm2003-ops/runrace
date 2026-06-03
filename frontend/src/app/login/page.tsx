"use client";

import { Suspense, useState } from "react";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from "firebase/auth";
import { useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
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

function LoginContent() {
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("return"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inApp = isInAppBrowser();

  async function afterLogin() {
    nativeNavigate(returnTo);
  }

  async function completeBackendLogin(user: User) {
    await apiFetch("/api/auth/login", {
      method: "POST",
      user,
      redirectOn401: false,
    });
    await afterLogin();
  }

  async function signInGoogle() {
    setError(null);
    if (inApp) {
      setError(IN_APP_LOGIN_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      if (preferAuthRedirect()) {
        sessionStorage.setItem(LOGIN_RETURN_KEY, returnTo);
        sessionStorage.setItem(LOGIN_PENDING_KEY, "1");
        await signInWithRedirect(auth, new GoogleAuthProvider());
        return;
      }
      const cred = await signInWithGoogleApp();
      await completeBackendLogin(cred.user);
    } catch (e) {
      const msg = String(e);
      if (/popup|blocked|closed/i.test(msg)) {
        setError(
          "로그인 창이 차단되었습니다. Chrome 설정에서 팝업 허용 후 다시 시도해 주세요.",
        );
      } else {
        setError(msg);
      }
      sessionStorage.removeItem(LOGIN_PENDING_KEY);
    } finally {
      setBusy(false);
    }
  }

  async function signInApple() {
    setError(null);
    if (inApp) {
      setError(IN_APP_LOGIN_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const provider = new OAuthProvider("apple.com");
      if (preferAuthRedirect()) {
        sessionStorage.setItem(LOGIN_RETURN_KEY, returnTo);
        sessionStorage.setItem(LOGIN_PENDING_KEY, "1");
        await signInWithRedirect(auth, provider);
        return;
      }
      const cred = await signInWithPopup(auth, provider);
      await completeBackendLogin(cred.user);
    } catch (e) {
      const msg = String(e);
      if (/popup|blocked|closed/i.test(msg)) {
        setError(
          "로그인 창이 차단되었습니다. Chrome 설정에서 팝업 허용 후 다시 시도해 주세요.",
        );
      } else {
        setError(msg);
      }
      sessionStorage.removeItem(LOGIN_PENDING_KEY);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">RunRace</h1>
        <p className="mt-2 text-sm text-zinc-600">
          로그인 후 친구를 초대하고 50km 대결을 만들어 경쟁해보세요.
        </p>

        {inApp && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {IN_APP_LOGIN_MESSAGE}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}

        <div className="mt-6 grid gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={signInGoogle}
            className="h-11 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy ? "로그인 중..." : "Google 로그인"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={signInApple}
            className="h-11 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-50"
          >
            Apple 로그인
          </button>
        </div>

        <p className="mt-6 text-xs text-zinc-500">
          Apple 로그인은 Firebase 콘솔에서 Apple provider 설정이 필요합니다.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
          <p className="text-sm text-zinc-500">로딩 중...</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
