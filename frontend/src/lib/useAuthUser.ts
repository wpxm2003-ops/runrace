"use client";

import { onAuthStateChanged, User } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "./firebase";

export function useAuthUser() {
  /**
   * Firebase는 초기화 시 캐시된 사용자를 auth.currentUser에 동기적으로 설정한다.
   * 이를 초기값으로 사용하면 재방문 사용자의 "로딩 중..." 플래시가 사라진다.
   */
  const [user, setUser] = useState<User | null>(() =>
    typeof window !== "undefined" ? auth.currentUser : null,
  );
  /**
   * 캐시된 사용자가 이미 있으면 loading을 false로 시작 → 즉시 렌더링.
   * 캐시가 없으면 onAuthStateChanged 확인까지 loading 유지.
   */
  const [loading, setLoading] = useState(() =>
    typeof window === "undefined" || auth.currentUser === null,
  );

  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!active) return;
      if (u) {
        try {
          /**
           * getIdToken() (force=false): 토큰이 유효하면 캐시를 반환, 만료 임박 시만 갱신.
           * 이전의 getIdToken(true)는 매번 강제 갱신이라 200-500ms가 추가되었다.
           */
          await u.getIdToken();
        } catch {
          setUser(null);
          setLoading(false);
          return;
        }
      }
      setUser(u);
      setLoading(false);
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  return { user, loading };
}
