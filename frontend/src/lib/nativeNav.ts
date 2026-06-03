import { Capacitor } from "@capacitor/core";

/** Capacitor APK: 정적 export는 .html 파일 — 클라이언트 라우터 대신 전체 페이지 이동 */
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

export function nativeNavigate(path: string): void {
  window.location.assign(nativeHref(path));
}
