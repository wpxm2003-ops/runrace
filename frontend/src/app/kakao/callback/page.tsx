"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildNativeKakaoCallbackUrl,
  completeKakaoLogin,
  isNativeKakaoOAuthState,
} from "@/lib/kakaoAuth";
import { LOGIN_RETURN_KEY, safeReturnPath } from "@/lib/authLogin";
import { nativeNavigate } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";
import { track, setAnalyticsUser } from "@/lib/analytics";
import { auth } from "@/lib/firebase";

/**
 * 카카오 OAuth 리다이렉트 콜백 페이지.
 * URL: /kakao/callback?code=...&state=...
 *
 * 네이티브 앱: state=native:... 이면 인앱 브라우저에서 앱 스킴으로 code를 넘긴다.
 * 웹: code를 백엔드로 보내 Firebase Custom Token을 받아 로그인을 완료한다.
 */
export default function KakaoCallbackPage() {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);

  const searchParams = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search);
  }, []);

  const code = searchParams?.get("code") ?? null;
  const isCancelled = searchParams?.has("error") ?? false;
  const oauthError = searchParams?.get("error");

  useEffect(() => {
    if (!searchParams) return;

    const state = searchParams.get("state");
    const nativeBridge = isNativeKakaoOAuthState(state);

    if (isCancelled) {
      if (nativeBridge) {
        window.location.href = buildNativeKakaoCallbackUrl({ error: oauthError, state });
        return;
      }
      nativeNavigate("/login");
      return;
    }

    if (!code) {
      setError(t.kakao_callback_error);
      return;
    }

    if (nativeBridge) {
      window.location.href = buildNativeKakaoCallbackUrl({ code, state });
      return;
    }

    const returnTo = safeReturnPath(sessionStorage.getItem(LOGIN_RETURN_KEY));
    sessionStorage.removeItem(LOGIN_RETURN_KEY);

    completeKakaoLogin(code)
      .then(() => {
        const uid = auth.currentUser?.uid;
        if (uid) void setAnalyticsUser(uid);
        void track("login", { method: "kakao" });
        nativeNavigate(returnTo || "/");
      })
      .catch((e) => setError(String(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isCancelled, searchParams]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-sm text-center">
          <p className="text-sm text-red-700">{error}</p>
          <a
            href="/login"
            className="mt-6 block h-11 rounded-xl bg-zinc-900 py-3 text-center text-sm text-white hover:bg-zinc-800"
          >
            {t.kakao_callback_retry}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-sm text-center">
        <div className="text-2xl">🟡</div>
        <p className="mt-4 text-sm text-zinc-600">{t.kakao_callback_processing}</p>
      </div>
    </div>
  );
}
