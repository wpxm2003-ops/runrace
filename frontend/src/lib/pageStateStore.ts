import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * SPA 탐색 시 페이지 상태(스크롤·탭·페이지수 등)를 메모리에 보존한다.
 * 웹: 전체 새로고침 시 초기화 — 의도적 재방문은 항상 처음부터 시작한다.
 * 네이티브 앱: sessionStorage에 백업해 WebView가 재로드(앱 재개·네이티브 로그인 복귀 등)돼도
 *   스크롤·탭 위치가 살아남게 한다. 앱을 완전히 종료하면 sessionStorage도 비워져 초기화된다.
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

const SESSION_KEY = "runrace_page_state";

/** 네이티브 앱에서만 sessionStorage 백업을 사용한다. */
function persistEnabled(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

function hydrate(): Map<string, PageState> {
  if (!persistEnabled()) return new Map();
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, PageState>;
      if (obj && typeof obj === "object") return new Map(Object.entries(obj));
    }
  } catch {
    /* 파싱 실패 시 빈 상태로 시작 */
  }
  return new Map();
}

const store = hydrate();

/** 현재 메모리 상태를 sessionStorage에 기록한다(네이티브). 재로드 직전(pagehide 등)에 호출. */
export function persistPageState(): void {
  if (!persistEnabled()) return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(Object.fromEntries(store)));
  } catch {
    /* 용량 초과 등은 무시 — 복원은 best-effort */
  }
}

export function savePageState(key: string, patch: Partial<PageState>): void {
  store.set(key, { ...store.get(key), ...patch });
}

export function loadPageState(key: string): PageState {
  return store.get(key) ?? {};
}

/**
 * 스크롤 복원 대상 경로 → store key.
 * usePageScrollRestore를 호출하는 페이지와 1:1로 유지할 것 — 여기 등록돼야
 * nativeNavigate 직전의 최종 스크롤 위치가 저장된다(스크롤 리스너의 보완).
 * 쿼리로 개별 대상이 갈리는 상세 페이지(/crew/match?id=…)는 키가 섞이므로 제외.
 */
const RESTORABLE_PATHS = [
  "/my",
  "/challenges",
  "/records",
  "/crew",
  "/crew/races",
  "/crew/matches",
  "/rivals",
  "/shoes",
  "/training",
];

export function pageStateKeyFromPath(pathname: string): string | null {
  return RESTORABLE_PATHS.includes(pathname) ? `page:${pathname.slice(1)}` : null;
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
