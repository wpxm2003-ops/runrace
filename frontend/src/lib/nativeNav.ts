import { Capacitor } from "@capacitor/core";
import { pageStateKeyFromPath, savePageState } from "@/lib/pageStateStore";

export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

/** 네이티브 앱이 아닌 iOS 웹/PWA(아이폰·아이패드) 여부 — 백그라운드 GPS 한계 안내·러닝 화면 보호용. */
export function isIosWeb(): boolean {
  if (typeof navigator === "undefined" || isNativeApp()) return false;
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS는 데스크톱 Safari로 위장 → 터치 가능한 Mac으로 식별
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function nativeHref(path: string): string {
  if (!isNativeApp()) return path;

  const hashIdx = path.indexOf("#");
  const hash = hashIdx >= 0 ? path.slice(hashIdx) : "";
  const withoutHash = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
  const qIdx = withoutHash.indexOf("?");
  const search = qIdx >= 0 ? withoutHash.slice(qIdx) : "";
  let pathname = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash;

  if (!pathname.startsWith("/")) return path;
  if (pathname.endsWith(".html")) return path;
  if (pathname.endsWith("/") && pathname.length > 1) {
    pathname = pathname.slice(0, -1);
  }
  if (pathname === "/" || pathname === "") {
    return `/index.html${search}${hash}`;
  }

  return `${pathname}.html${search}${hash}`;
}

const TAB_ROOTS = new Set(["/", "/challenges", "/workout", "/records", "/my", "/login"]);

/** NativeNavBootstrap이 등록한 Next.js router.push */
type PushFn = (path: string, opts?: { scroll?: boolean }) => void;
let _push: PushFn | null = null;
let _replace: PushFn | null = null;
let _back: (() => void) | null = null;

/** SPA router.push 시 Android 뒤로가기용 이전 경로 스택 */
const NAV_STACK_KEY = "runrace_nav_stack";

function hydrateNavStack(): string[] {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return [];
  try {
    const raw = sessionStorage.getItem(NAV_STACK_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.every((p) => typeof p === "string")) return arr;
    }
  } catch {
    /* 파싱 실패 시 빈 스택 */
  }
  return [];
}

const navStack: string[] = hydrateNavStack();
let backNavigation = false;

/** 모달·바텀시트 등 오버레이가 백버튼을 가로채기 위한 LIFO 스택. */
const backInterceptors: Array<() => void> = [];

/**
 * 백버튼 인터셉터를 등록한다. 등록된 동안 하드웨어 백버튼은 SPA 네비게이션 대신
 * fn을 호출하고 종료된다(한 번 호출 후 자동 제거).
 * 반환값은 cleanup 함수 — useEffect return으로 사용하면 컴포넌트 언마운트 시 해제된다.
 */
export function pushBackInterceptor(fn: () => void): () => void {
  backInterceptors.push(fn);
  return () => {
    const idx = backInterceptors.lastIndexOf(fn);
    if (idx !== -1) backInterceptors.splice(idx, 1);
  };
}

/**
 * 뒤로가기 스택을 sessionStorage에 백업한다(네이티브).
 * WebView 재로드로 메모리 스택이 날아가도 뒤로가기가 SPA 이전 화면으로 복귀하게 한다.
 */
export function persistNavStack(): void {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;
  try {
    sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(navStack));
  } catch {
    /* 무시 — 복원은 best-effort */
  }
}

function currentPath(): string {
  return window.location.pathname + window.location.search;
}

function normalizePath(path: string): string {
  const qIdx = path.indexOf("?");
  return qIdx >= 0 ? path.slice(0, qIdx) : path;
}

export function registerPush(fn: PushFn) {
  _push = (path: string) => {
    const target = path.split("#")[0];
    const current = currentPath();
    const isBack = backNavigation;
    if (!isBack && normalizePath(current) !== normalizePath(target)) {
      const key = pageStateKeyFromPath(normalizePath(current));
      if (key) savePageState(key, { scroll: window.scrollY });
      navStack.push(current);
      persistNavStack();
    }
    backNavigation = false;
    fn(path, { scroll: !isBack });
  };
}

/**
 * 현재 경로를 새 경로로 "대체"하는 이동을 등록한다(router.replace).
 * 삭제 후처럼 현재 화면을 히스토리에 남기면 안 되는 경우에 쓴다 — navStack에 현재 경로를 쌓지 않는다.
 */
export function registerReplace(fn: PushFn) {
  _replace = (path: string) => {
    backNavigation = false;
    fn(path);
  };
}

export function registerBack(fn: () => void) {
  _back = fn;
}

/** SPA 라우터(router.push)가 등록됐는지 — 딥링크 콜드 스타트에서 풀페이지 리로드 폴백을 피하기 위해 사용. */
export function isNativeNavReady(): boolean {
  return _push != null;
}

export function isTabRoot(pathname: string): boolean {
  return TAB_ROOTS.has(pathname);
}

/** WebView 히스토리가 없을 때 하드웨어 뒤로가기 fallback */
export function resolveBackFallback(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);

  if (/^\/workouts\/\d+/.test(pathname)) {
    const challengeId = params.get("challenge");
    if (challengeId && /^\d+$/.test(challengeId)) {
      return `/challenges/${challengeId}`;
    }
    return "/records";
  }

  const editMatch = pathname.match(/^\/challenges\/(\d+)\/edit$/);
  if (editMatch) return `/challenges/${editMatch[1]}`;

  const detailMatch = pathname.match(/^\/challenges\/(\d+)$/);
  if (detailMatch) return "/challenges";

  if (pathname === "/challenges/create") return "/challenges";

  return null;
}

export function handleNativeBack(canGoBack: boolean): void {
  if (!isNativeApp()) return;

  // 0) 오버레이 인터셉터(모달·바텀시트 등) — 최상위 것을 꺼내 호출하고 종료.
  if (backInterceptors.length > 0) {
    backInterceptors.pop()!();
    return;
  }

  // 1) 실제 이전 경로(SPA 스택) — 가장 정확. router.push로 같은 문서 안에서 전환해
  //    SWR 캐시·스크롤 위치를 유지한다.
  const prev = navStack.pop();
  if (prev && _push) {
    persistNavStack();
    backNavigation = true;
    _push(prev);
    return;
  }

  // 2) 스택이 비었어도 레이스/운동 등 알려진 경로는 SPA로 상위 화면에 올린다.
  //    정적 export + Capacitor에선 router.back()이 문서를 새로 로드해(동적 경로는 파일이 없어 404)
  //    캐시·스크롤이 날아가고 목록/상세가 매번 스켈레톤부터 다시 조회된다 — 그 폴백을 router.back()보다 먼저 둔다.
  const fallback = resolveBackFallback(
    window.location.pathname,
    window.location.search,
  );
  if (fallback && _push) {
    backNavigation = true;
    _push(fallback);
    return;
  }

  // 3) 탭 루트에서 navStack이 비었으면 즉시 종료 — canGoBack보다 먼저 확인해야 함.
  //    SPA push로 뒤로가기를 처리하면 WebView 히스토리에 엔트리가 계속 쌓여
  //    canGoBack이 탭 루트에서도 항상 true가 되기 때문.
  if (isTabRoot(window.location.pathname)) {
    void import("@capacitor/app").then(({ App }) => App.exitApp());
    return;
  }

  // 4) 탭 루트가 아닌 일반 경로 — WebView 히스토리가 있으면 back에 맡긴다.
  //    히스토리가 없으면(딥링크 진입 등) router.back()은 no-op이 되어 막다른 골목이 되므로,
  //    탭 루트와 동일하게 앱을 종료한다.
  if (canGoBack && _back) {
    _back();
    return;
  }

  void import("@capacitor/app").then(({ App }) => App.exitApp());
}

/**
 * 앱 내 페이지 이동. router.push가 등록된 경우 SPA 전환,
 * 미등록(초기 렌더 등)이면 fallback으로 location.assign.
 */
export function nativeNavigate(path: string, opts?: { replace?: boolean }): void {
  if (opts?.replace) {
    if (_replace) {
      _replace(path);
      return;
    }
    window.location.replace(nativeHref(path));
    return;
  }
  if (_push) {
    _push(path);
    return;
  }
  window.location.assign(nativeHref(path));
}
