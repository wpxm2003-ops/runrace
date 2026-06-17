"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { auth } from "./firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
  /**
   * 이전에 로그인한 적이 있어 곧 user가 복원될 것으로 기대되는 낙관 플래그.
   * 하드 내비게이션·콜드 스타트로 Provider가 재마운트되어 authStateReady를 다시 기다리는 동안,
   * 헤더 등이 스켈레톤 대신 로그인 상태를 미리 표시해 깜빡임을 막는다.
   */
  hint: boolean;
}

/** localStorage key — 앱 재시작 후에도 "이전에 로그인했음"을 기억한다 */
export const AUTH_HINT_KEY = "runrace_logged_in";

/** SSR 프리렌더 시 useLayoutEffect 경고를 피하면서, 클라이언트에선 페인트 전에 실행한다. */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * 로그인 성공 직후, 페이지 이동 전에 호출.
 * 다음 페이지 로드 시 AuthProvider가 loading=true 로 시작해 redirect를 막는다.
 */
export function markLoggedIn() {
  if (typeof window !== "undefined") {
    localStorage.setItem(AUTH_HINT_KEY, "1");
  }
}

/** Firebase 인증 결과를 localStorage 힌트에 반영한다(로그인 기록 set/remove). */
function syncAuthHint(user: User | null) {
  if (user) {
    localStorage.setItem(AUTH_HINT_KEY, "1");
  } else {
    localStorage.removeItem(AUTH_HINT_KEY);
  }
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, hint: false });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    // Firebase가 이미 메모리에 초기화돼 있으면(앱 재개·SPA 이동 등 WebView 유지 상황)
    // auth.currentUser를 동기적으로 읽어 authStateReady() 비동기 대기를 건너뛴다.
    // → waitForAuth=false가 즉시 확정돼 상세 화면이 fetch 완료 즉시 뜬다.
    if (typeof window !== "undefined") {
      const current = auth.currentUser;
      if (current) {
        syncAuthHint(current);
        return { user: current, loading: false, hint: false };
      }
    }
    return { user: null, loading: true, hint: false };
  });

  // 페인트 전에 이전 로그인 힌트를 반영 → 인증 복원을 기다리는 동안 로그인 상태를 낙관적으로 표시.
  useIsomorphicLayoutEffect(() => {
    if (localStorage.getItem(AUTH_HINT_KEY) === "1") {
      setState((s) => (s.loading ? { ...s, hint: true } : s));
    }
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    void auth.authStateReady().then(() => {
      const current = auth.currentUser;
      syncAuthHint(current);
      setState({ user: current, loading: false, hint: false });

      unsub = onAuthStateChanged(auth, (u) => {
        syncAuthHint(u);
        setState({ user: u, loading: false, hint: false });
      });
    });

    return () => unsub?.();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
