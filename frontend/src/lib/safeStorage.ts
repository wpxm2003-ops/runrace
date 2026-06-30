/**
 * SSR 가드 + try/catch + JSON 직렬화를 묶은 얇은 스토리지 래퍼.
 * 도메인 정책(만료·플랫폼 게이트 등)은 호출부에 둔다.
 */
export type JsonStore<T> = {
  get(): T | null;
  set(value: T): void;
  remove(): void;
};

function safeJsonStore<T>(pick: () => Storage, key: string): JsonStore<T> {
  function storage(): Storage | null {
    if (typeof window === "undefined") return null;
    try {
      return pick();
    } catch {
      return null;
    }
  }
  return {
    get() {
      const s = storage();
      if (!s) return null;
      try {
        const raw = s.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    set(value) {
      const s = storage();
      if (!s) return;
      try {
        s.setItem(key, JSON.stringify(value));
      } catch {
        /* 용량 초과·차단 환경 무시 */
      }
    },
    remove() {
      const s = storage();
      if (!s) return;
      try {
        s.removeItem(key);
      } catch {
        /* 무시 */
      }
    },
  };
}

/** localStorage 기반 JSON 저장소. */
export function localJson<T>(key: string): JsonStore<T> {
  return safeJsonStore<T>(() => window.localStorage, key);
}

/** sessionStorage 기반 JSON 저장소. */
export function sessionJson<T>(key: string): JsonStore<T> {
  return safeJsonStore<T>(() => window.sessionStorage, key);
}
