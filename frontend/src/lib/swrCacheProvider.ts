"use client";

const STORAGE_KEY = "runrace_swr_cache";

type CacheEntry = { data: unknown };

const VOLATILE_LIST_PREFIXES = [
  "challenges-page",
  "challenges-mine-page",
  "crew-races",
] as const;

/** Server-side batches can remove races, so race lists must not survive an app restart. */
export function isPersistentSwrCacheKey(key: string): boolean {
  return !VOLATILE_LIST_PREFIXES.some((prefix) => key.includes(`@"${prefix}",`));
}

/**
 * SWR 영구 캐시 프로바이더 (localStorage 기반).
 *
 * - 앱 시작 시 이전 데이터를 즉시 표시 → 스켈레톤 없음
 * - SWR이 항상 백그라운드 재검증하므로 변경사항은 ~200ms 내 반영
 * - data만 저장 (error·isValidating은 저장 안 함 → 복원 후 clean state)
 */
export function createSwrCacheProvider(): Map<string, CacheEntry> {
  if (typeof window === "undefined") return new Map();

  let map: Map<string, CacheEntry> = new Map();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const entries = JSON.parse(raw) as [string, CacheEntry][];
      map = new Map(entries.filter(([key]) => isPersistentSwrCacheKey(key)));
    }
  } catch {}

  function persist() {
    try {
      const entries: [string, CacheEntry][] = [];
      for (const [key, value] of map.entries()) {
        if (!isPersistentSwrCacheKey(key)) continue;
        // error나 undefined data는 저장하지 않는다
        if ((value as { data?: unknown })?.data !== undefined) {
          entries.push([key, { data: (value as { data: unknown }).data }]);
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // localStorage 용량 초과 등 — 조용히 무시
    }
  }

  // Capacitor WebView에서는 pagehide + visibilitychange로 저장 타이밍을 잡는다
  window.addEventListener("pagehide", persist);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist();
  });

  return map;
}
