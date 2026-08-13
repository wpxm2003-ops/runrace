/**
 * SSR 가드 + try/catch + JSON 직렬화를 묶은 얇은 스토리지 래퍼.
 * 도메인 정책(만료·플랫폼 게이트 등)은 호출부에 둔다.
 */
export type JsonStore<T> = {
  get(): T | null;
  set(value: T): void;
  remove(): void;
};

function guardedStorage(pick: () => Storage): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return pick();
  } catch {
    return null;
  }
}

function safeJsonStore<T>(pick: () => Storage, key: string): JsonStore<T> {
  const storage = () => guardedStorage(pick);
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

/** 원시 문자열 저장용 — JSON 직렬화 없이 저장된 기존 키("km", "1" 등)와 호환. */
export type TextStore = {
  get(): string | null;
  set(value: string): void;
};

/**
 * localStorage 기반 원시 문자열 저장소. 프라이빗 모드처럼 setItem이 throw하는 환경에서도
 * 사용자 액션(단위/언어 변경 등)이 죽지 않도록 조용히 무시한다(JsonStore와 같은 계약).
 */
export function localText(key: string): TextStore {
  return {
    get() {
      const s = guardedStorage(() => window.localStorage);
      if (!s) return null;
      try {
        return s.getItem(key);
      } catch {
        return null;
      }
    },
    set(value) {
      const s = guardedStorage(() => window.localStorage);
      if (!s) return;
      try {
        s.setItem(key, value);
      } catch {
        /* 용량 초과·차단 환경 무시 */
      }
    },
  };
}

/** sessionStorage 기반 JSON 저장소. */
export function sessionJson<T>(key: string): JsonStore<T> {
  return safeJsonStore<T>(() => window.sessionStorage, key);
}
