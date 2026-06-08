"use client";

import { useEffect, useRef } from "react";
import { getRedirectResult } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { syncBackendLogin } from "@/lib/api";
import {
  LOGIN_RETURN_KEY,
  LOGIN_PENDING_KEY,
  OAUTH_REDIRECT_FAILED_KEY,
  safeReturnPath,
} from "@/lib/authLogin";
import { markLoggedIn } from "@/lib/AuthProvider";
import { nativeNavigate } from "@/lib/nativeNav";

/**
 * Google redirect 로그인은 /login 이 아닌 URL로 돌아올 수 있어 앱 전역에서 1회 처리
 */
export function AuthRedirectHandler() {
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    (async () => {
      const pending = sessionStorage.getItem(LOGIN_PENDING_KEY) === "1";
      try {
        const cred = await getRedirectResult(auth);
        const user = cred?.user ?? (pending ? auth.currentUser : null);
        if (!user) {
          if (pending) {
            sessionStorage.setItem(OAUTH_REDIRECT_FAILED_KEY, "1");
            sessionStorage.removeItem(LOGIN_PENDING_KEY);
          }
          return;
        }

        sessionStorage.removeItem(LOGIN_PENDING_KEY);
        markLoggedIn();
        await syncBackendLogin(user);

        const saved = sessionStorage.getItem(LOGIN_RETURN_KEY);
        sessionStorage.removeItem(LOGIN_RETURN_KEY);
        nativeNavigate(safeReturnPath(saved) || "/");
      } catch (e) {
        console.error("OAuth redirect login failed", e);
        sessionStorage.removeItem(LOGIN_PENDING_KEY);
        if (pending) sessionStorage.setItem(OAUTH_REDIRECT_FAILED_KEY, "1");
      }
    })();
  }, []);

  return null;
}
