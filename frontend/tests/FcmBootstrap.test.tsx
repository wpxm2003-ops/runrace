// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { ko } from "@/lib/i18n/locales/ko";

const mocks = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getToken: vi.fn(),
  registerDeviceToken: vi.fn(),
  markReady: vi.fn(),
  getCurrentPosition: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
}));
vi.mock("@capacitor/app", () => ({
  App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}));
vi.mock("@capacitor-firebase/messaging", () => ({
  FirebaseMessaging: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    getToken: mocks.getToken,
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
    removeAllListeners: vi.fn(async () => {}),
  },
}));
vi.mock("@/lib/AuthProvider", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/api/push", () => ({ registerDeviceToken: mocks.registerDeviceToken }));
vi.mock("@/lib/api", () => ({ reportClientError: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/nativePermissions", () => ({ markNativePermissionsReady: mocks.markReady }));
vi.mock("@/lib/nativeNav", () => ({ nativeNavigate: vi.fn(), pushBackInterceptor: () => () => {} }));
vi.mock("@/lib/i18n", () => ({ useLocale: () => ({ t: ko, locale: "ko" }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { FcmBootstrap } from "@/app/_components/FcmBootstrap";
import { onPushTokenRegistered, requestPushTokenSync } from "@/lib/pushPermission";

async function flush(ms: number) {
  await act(async () => {
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(ms);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);
  });
}

// 컴포넌트는 플러그인을 동적 import한다. 첫 로드는 가짜 타이머로 진행되지 않으므로 미리 불러 둔다
// (안 그러면 "권한을 요청하지 않음" 단언이 import가 덜 끝나서 통과해 버릴 수 있다).
beforeAll(async () => {
  await import("@capacitor-firebase/messaging");
  await import("@capacitor/app");
});

beforeEach(() => {
  vi.useFakeTimers();
  mocks.user = { uid: "runner" };
  for (const fn of [
    mocks.checkPermissions,
    mocks.requestPermissions,
    mocks.getToken,
    mocks.registerDeviceToken,
    mocks.markReady,
    mocks.getCurrentPosition,
  ]) {
    fn.mockReset();
  }
  mocks.getCurrentPosition.mockImplementation((ok: () => void) => ok());
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition: mocks.getCurrentPosition },
    configurable: true,
  });
  mocks.getToken.mockResolvedValue({ token: "device-token" });
  mocks.registerDeviceToken.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FcmBootstrap first launch", () => {
  it("asks for location only — never the notification permission", async () => {
    mocks.checkPermissions.mockResolvedValue({ receive: "prompt" });
    render(<FcmBootstrap />);
    await flush(10_000);
    expect(mocks.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(mocks.markReady).toHaveBeenCalled();
    // 토큰 동기화는 실제로 돌았고(권한 확인), 확인만 하고 끝났다.
    expect(mocks.checkPermissions).toHaveBeenCalled();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.registerDeviceToken).not.toHaveBeenCalled();
  });

  it("still registers the token at login when notifications are already allowed", async () => {
    mocks.checkPermissions.mockResolvedValue({ receive: "granted" });
    render(<FcmBootstrap />);
    await flush(2000);
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.registerDeviceToken).toHaveBeenCalledTimes(1);
    expect(mocks.registerDeviceToken).toHaveBeenCalledWith(mocks.user, "device-token", "android");
  });

  it("registers right after the user allows notifications later", async () => {
    mocks.checkPermissions.mockResolvedValue({ receive: "prompt" });
    const onRegistered = vi.fn();
    const release = onPushTokenRegistered(onRegistered);
    render(<FcmBootstrap />);
    await flush(2000);
    expect(mocks.registerDeviceToken).not.toHaveBeenCalled();

    // 사전 설명 시트·설정 토글에서 허용한 직후
    mocks.checkPermissions.mockResolvedValue({ receive: "granted" });
    let synced: boolean | undefined;
    await act(async () => {
      synced = await requestPushTokenSync();
    });
    expect(synced).toBe(true);
    expect(mocks.registerDeviceToken).toHaveBeenCalledTimes(1);
    expect(onRegistered).toHaveBeenCalledTimes(1);

    // 이미 등록된 토큰이면 다시 보내지 않고 등록됨으로 답한다.
    await act(async () => {
      synced = await requestPushTokenSync();
    });
    expect(synced).toBe(true);
    expect(mocks.registerDeviceToken).toHaveBeenCalledTimes(1);
    release();
  });

  it("re-registers the same device token for a newly signed-in account", async () => {
    mocks.checkPermissions.mockResolvedValue({ receive: "granted" });
    const { rerender } = render(<FcmBootstrap />);
    await flush(2000);
    expect(mocks.registerDeviceToken).toHaveBeenCalledTimes(1);

    mocks.user = { uid: "another-runner" };
    rerender(<FcmBootstrap />);
    await flush(2000);
    expect(mocks.registerDeviceToken).toHaveBeenCalledTimes(2);
    expect(mocks.registerDeviceToken).toHaveBeenLastCalledWith(
      { uid: "another-runner" } as User,
      "device-token",
      "android",
    );
  });

  it("reports no sync when logged out", async () => {
    mocks.user = null;
    render(<FcmBootstrap />);
    await expect(requestPushTokenSync()).resolves.toBe(false);
  });
});
