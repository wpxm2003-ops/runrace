"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "./firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
}

/** localStorage key — 앱 재시작 후에도 "이전에 로그인했음"을 기억한다 */
export const AUTH_HINT_KEY = "runrace_logged_in";

/**
 * 로그인 성공 직후, 페이지 이동 전에 호출.
 * 다음 페이지 로드 시 AuthProvider가 loading=true 로 시작해 redirect를 막는다.
 */
export function markLoggedIn() {
  if (typeof window !== "undefined") {
    localStorage.setItem(AUTH_HINT_KEY, "1");
  }
}

function getInitialState(): AuthState {
  return { user: null, loading: true };
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(getInitialState);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        localStorage.setItem(AUTH_HINT_KEY, "1");
      } else {
        localStorage.removeItem(AUTH_HINT_KEY);
      }
      setState({ user: u, loading: false });
    });
    return unsub;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
