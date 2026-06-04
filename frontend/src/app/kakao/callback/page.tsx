"use client";

import { useEffect, useMemo, useState } from "react";
import { completeKakaoLogin } from "@/lib/kakaoAuth";
import { LOGIN_RETURN_KEY, safeReturnPath } from "@/lib/authLogin";
import { nativeNavigate } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";

/**
 * 카카오 OAuth 리다이렉트 콜백 페이지.
 * URL: /kakao/callback?code=...
 *
 * 카카오가 authorization code를 붙여 여기로 돌아온다.
 * code를 백엔드로 보내 Firebase Custom Token을 받아 로그인을 완료하고,
 * 저장된 returnTo 경로로 이동한다.
 */
export default function KakaoCallbackPage() {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);

  const code = useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    // 사용자가 카카오 로그인을 취소한 경우
    const errParam = params.get("error");
    if (errParam) return null;
    return params.get("code");
  }, []);

  const isCancelled = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("error");
  }, []);

  useEffect(() => {
    if (isCancelled) {
      nativeNavigate("/login");
      return;
    }
    if (!code) {
      setError(t.kakao_callback_error);
      return;
    }

    const returnTo = safeReturnPath(sessionStorage.getItem(LOGIN_RETURN_KEY));
    sessionStorage.removeItem(LOGIN_RETURN_KEY);

    completeKakaoLogin(code)
      .then(() => nativeNavigate(returnTo || "/"))
      .catch((e) => setError(String(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isCancelled]);

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
