import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
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

/** NativeNavBootstrap이 등록한 Next.js router.push */
type PushFn = (path: string) => void;
let _push: PushFn | null = null;

export function registerPush(fn: PushFn) {
  _push = fn;
}

/**
 * 앱 내 페이지 이동. router.push가 등록된 경우 SPA 전환,
 * 미등록(초기 렌더 등)이면 fallback으로 location.assign.
 */
export function nativeNavigate(path: string): void {
  if (_push) {
    _push(path);
    return;
  }
  window.location.assign(nativeHref(path));
}
