import { Capacitor } from "@capacitor/core";

let ready = !Capacitor.isNativePlatform();
const waiters: (() => void)[] = [];

/** 네이티브 앱: GPS → 알림 권한 순차 요청이 끝날 때까지 대기 */
export function waitForNativePermissions(): Promise<void> {
  if (ready) return Promise.resolve();
  return new Promise((resolve) => waiters.push(resolve));
}

export function markNativePermissionsReady(): void {
  if (ready) return;
  ready = true;
  for (const resolve of waiters) resolve();
  waiters.length = 0;
}
