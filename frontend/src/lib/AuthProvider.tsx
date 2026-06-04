"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "./firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

/** 앱 전체에서 Firebase Auth 상태를 단일 인스턴스로 공유한다. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const cached = typeof window !== "undefined" ? auth.currentUser : null;
    return { user: cached, loading: cached === null };
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          await u.getIdToken();
        } catch {
          setState({ user: null, loading: false });
          return;
        }
      }
      setState({ user: u, loading: false });
    });
    return unsub;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

/** 전역 Auth 상태를 읽는다. AuthProvider 하위에서만 사용 가능. */
export function useAuth(): AuthState {
  return useContext(AuthContext);
}
