"use client";

import { useEffect } from "react";
import { redirectToLogin } from "./auth";
import { useAuthUser } from "./useAuthUser";

/**
 * 로그인이 필요한 페이지용 훅. 인증이 확인되지 않으면 로그인 페이지로 보낸다.
 *
 * 각 페이지에 흩어져 있던 `if (!loading && !user) redirectToLogin(...)` 가드를 하나로 묶는다.
 * {@link redirectToLogin}이 returnTo 미지정 시 현재 경로를 사용하므로, 로그인 후 제자리로 돌아온다.
 *
 * @param returnTo 로그인 후 돌아올 경로(미지정 시 현재 경로)
 */
export function useRequireAuth(returnTo?: string) {
  const { user, loading } = useAuthUser();

  useEffect(() => {
    if (!loading && !user) {
      redirectToLogin(returnTo);
    }
  }, [loading, user, returnTo]);

  return { user, loading };
}
