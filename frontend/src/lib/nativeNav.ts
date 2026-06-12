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

/** 웹 푸시 토큰 등록용 플랫폼 라벨 — 아이폰 PWA 비중 파악·세분화 타겟팅용. */
export function webPlatform(): "web-ios" | "web-android" | "web" {
  if (isIosWeb()) return "web-ios";
  if (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "")) {
    return "web-android";
  }
  return "web";
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
const navStack: string[] = [];
let backNavigation = false;

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

  const prev = navStack.pop();
  if (prev && _push) {
    backNavigation = true;
    _push(prev);
    return;
  }

  if (canGoBack && _back) {
    _back();
    return;
  }

  const fallback = resolveBackFallback(
    window.location.pathname,
    window.location.search,
  );
  if (fallback && _push) {
    backNavigation = true;
    _push(fallback);
    return;
  }

  if (!isTabRoot(window.location.pathname)) {
    if (_back) {
      _back();
      return;
    }
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
