import { useEffect } from "react";

/**
 * SPA 탐색 시 페이지 상태(스크롤·탭·페이지수 등)를 메모리에 보존한다.
 * 전체 새로고침 시 초기화 — 의도적 재방문은 항상 처음부터 시작한다.
 */

export type PageState = {
  scroll?: number;
  phase?: string;
  size?: number;
  showAllLangs?: boolean;
  viewYear?: number;
  viewMonth?: number;
  selectedDateKey?: string | null;
};

const store = new Map<string, PageState>();

export function savePageState(key: string, patch: Partial<PageState>): void {
  store.set(key, { ...store.get(key), ...patch });
}

export function loadPageState(key: string): PageState {
  return store.get(key) ?? {};
}

/** 스크롤 복원 대상 경로 → store key */
export function pageStateKeyFromPath(pathname: string): string | null {
  if (pathname === "/my") return "page:my";
  if (pathname === "/challenges") return "page:challenges";
  if (pathname === "/records") return "page:records";
  return null;
}

/**
 * 페이지 높이가 충분해질 때까지 ResizeObserver로 감시하며 스크롤을 복원한다.
 * SWR 데이터 로딩으로 목록이 늘어나는 경우에도 자동으로 맞춰진다.
 */
export function restoreScroll(targetY: number): () => void {
  if (targetY <= 0) return () => {};

  let done = false;

  function tryRestore() {
    if (done) return;
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (max >= targetY - 8) {
      window.scrollTo(0, targetY);
      done = true;
      cleanup();
    }
  }

  const ro = new ResizeObserver(tryRestore);
  ro.observe(document.documentElement);
  ro.observe(document.body);

  requestAnimationFrame(tryRestore);
  const interval = window.setInterval(tryRestore, 100);
  const timeout = window.setTimeout(() => {
    if (!done) window.scrollTo(0, targetY);
    cleanup();
  }, 5000);

  function cleanup() {
    ro.disconnect();
    clearInterval(interval);
    clearTimeout(timeout);
  }

  return cleanup;
}

/**
 * 스크롤 위치를 실시간 저장하고, 복귀 시 restoreScroll로 복원한다.
 * retryToken(예: 목록 item 수)이 바뀌면 데이터 로드 후 재시도한다.
 */
export function usePageScrollRestore(key: string, retryToken?: unknown): void {
  useEffect(() => {
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        savePageState(key, { scroll: window.scrollY });
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [key]);

  useEffect(() => {
    const saved = loadPageState(key).scroll;
    if (!saved) return;
    return restoreScroll(saved);
  }, [key, retryToken]);
}
