// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { ko } from "@/lib/i18n/locales/ko";

const mocks = vi.hoisted(() => ({
  native: true,
  pluginAvailable: true,
  setting: { enabled: false, hasToken: false } as { enabled: boolean; hasToken: boolean } | undefined,
  mutate: vi.fn(),
  setNotificationSetting: vi.fn(),
  alert: vi.fn(),
  track: vi.fn(),
  toastError: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  openSettings: vi.fn(),
  appStateListeners: [] as Array<(state: { isActive: boolean }) => void>,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mocks.native,
    isPluginAvailable: () => mocks.pluginAvailable,
  },
  registerPlugin: () => ({ open: mocks.openSettings }),
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async (_event: string, fn: (state: { isActive: boolean }) => void) => {
      mocks.appStateListeners.push(fn);
      return { remove: vi.fn() };
    }),
  },
}));
vi.mock("@capacitor-firebase/messaging", () => ({
  FirebaseMessaging: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
  },
}));
vi.mock("@/lib/api", () => ({
  useNotificationSetting: () => ({ data: mocks.setting, isLoading: false, mutate: mocks.mutate }),
  setNotificationSetting: mocks.setNotificationSetting,
}));
vi.mock("@/app/_components/ConfirmProvider", () => ({ useAlert: () => mocks.alert }));
vi.mock("@/lib/analytics", () => ({ track: mocks.track }));
vi.mock("@/lib/nativeNav", () => ({ isIosWeb: () => false, isNativeApp: () => mocks.native }));
vi.mock("@/lib/i18n", () => ({ useLocale: () => ({ t: ko, locale: "ko" }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

import { NotificationToggle } from "@/app/my/_components/NotificationToggle";
import { setPushTokenSyncHandler } from "@/lib/pushPermission";
import { loadPushPromptRecord } from "@/lib/pushPrompt";

const user = { uid: "runner" } as User;

async function settle() {
  await act(async () => {
    await vi.dynamicImportSettled();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderToggle() {
  const view = render(<NotificationToggle user={user} />);
  await settle();
  return view;
}

async function resumeApp() {
  await act(async () => {
    for (const fn of mocks.appStateListeners) fn({ isActive: true });
    await Promise.resolve();
  });
  await settle();
}

// 토글은 플러그인을 동적 import한다. 테스트 순서와 무관하게 마이크로태스크 안에 풀리도록 미리 불러 둔다.
beforeAll(async () => {
  await import("@capacitor-firebase/messaging");
  await import("@capacitor/app");
});

beforeEach(() => {
  localStorage.clear();
  mocks.native = true;
  mocks.pluginAvailable = true;
  mocks.setting = { enabled: false, hasToken: false };
  mocks.appStateListeners = [];
  for (const fn of [
    mocks.mutate,
    mocks.setNotificationSetting,
    mocks.alert,
    mocks.track,
    mocks.toastError,
    mocks.checkPermissions,
    mocks.requestPermissions,
    mocks.openSettings,
  ]) {
    fn.mockReset();
  }
  mocks.mutate.mockResolvedValue(undefined);
  mocks.openSettings.mockResolvedValue({ screen: "notifications" });
});

afterEach(cleanup);

describe("NotificationToggle — denied by the OS", () => {
  beforeEach(() => {
    mocks.checkPermissions.mockResolvedValue({ receive: "denied" });
  });

  it("offers the phone settings button instead of a reinstall notice", async () => {
    await renderToggle();
    expect(screen.getByRole("button", { name: ko.push_settings_open_btn })).toBeTruthy();
    expect(screen.getByText(ko.push_settings_denied_desc)).toBeTruthy();
    expect(document.body.textContent).not.toContain("재설치");
  });

  it("opens the app's OS notification settings on a new APK", async () => {
    const sync = vi.fn(async () => true);
    const release = setPushTokenSyncHandler(sync);
    await renderToggle();
    fireEvent.click(screen.getByRole("button", { name: ko.push_settings_open_btn }));
    await settle();
    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith("push_settings_opened", { method: "native", source: "settings" });
    expect(screen.queryByText(ko.push_settings_steps)).toBeNull();

    // 휴대폰 설정에서 켜고 돌아옴
    mocks.checkPermissions.mockResolvedValue({ receive: "granted" });
    await resumeApp();
    expect(mocks.track).toHaveBeenCalledWith("push_permission_result", { result: "granted", source: "os_settings" });
    expect(sync).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: ko.push_settings_open_btn })).toBeNull();
    release();
  });

  it("shows step-by-step guidance on an older APK without the plugin", async () => {
    mocks.pluginAvailable = false;
    await renderToggle();
    fireEvent.click(screen.getByRole("button", { name: ko.push_settings_open_btn }));
    await settle();
    expect(mocks.openSettings).not.toHaveBeenCalled();
    expect(screen.getByText(ko.push_settings_steps)).toBeTruthy();
    expect(mocks.track).toHaveBeenCalledWith("push_settings_opened", { method: "guide", source: "settings" });
  });

  it("tapping the switch itself also leads to the settings", async () => {
    await renderToggle();
    fireEvent.click(screen.getByRole("switch"));
    await settle();
    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
  });
});

describe("NotificationToggle — OS can still ask", () => {
  beforeEach(() => {
    mocks.checkPermissions.mockResolvedValue({ receive: "prompt" });
  });

  it("requests the permission from the switch and registers the token", async () => {
    const sync = vi.fn(async () => true);
    const release = setPushTokenSyncHandler(sync);
    mocks.requestPermissions.mockResolvedValue({ receive: "granted" });
    await renderToggle();
    expect(screen.queryByRole("button", { name: ko.push_settings_open_btn })).toBeNull();

    fireEvent.click(screen.getByRole("switch"));
    await settle();
    await settle();
    expect(mocks.requestPermissions).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith("push_permission_result", { result: "granted", source: "settings" });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(loadPushPromptRecord()?.answered).toBe(true);
    release();
  });

  it("shows the settings button after a permanent denial", async () => {
    mocks.requestPermissions.mockResolvedValue({ receive: "denied" });
    await renderToggle();
    fireEvent.click(screen.getByRole("switch"));
    await settle();
    expect(mocks.track).toHaveBeenCalledWith("push_permission_result", { result: "denied", source: "settings" });
    expect(screen.getByRole("button", { name: ko.push_settings_open_btn })).toBeTruthy();
  });

  it("tells the user when the token could not be registered", async () => {
    const release = setPushTokenSyncHandler(async () => false);
    mocks.requestPermissions.mockResolvedValue({ receive: "granted" });
    await renderToggle();
    fireEvent.click(screen.getByRole("switch"));
    await settle();
    await settle();
    expect(mocks.toastError).toHaveBeenCalledWith(ko.push_token_sync_failed);
    release();
  });
});

describe("NotificationToggle — other states", () => {
  it("keeps the server toggle when a token exists", async () => {
    mocks.checkPermissions.mockResolvedValue({ receive: "granted" });
    mocks.setting = { enabled: true, hasToken: true };
    mocks.setNotificationSetting.mockResolvedValue(undefined);
    await renderToggle();
    fireEvent.click(screen.getByRole("switch"));
    await settle();
    expect(mocks.setNotificationSetting).toHaveBeenCalledWith(user, false);
    expect(mocks.track).toHaveBeenCalledWith("push_toggle", { enabled: false });
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
  });

  it("explains on the web that push lives in the Android app", async () => {
    mocks.native = false;
    await renderToggle();
    fireEvent.click(screen.getByRole("switch"));
    await settle();
    expect(mocks.alert).toHaveBeenCalledWith(
      expect.objectContaining({ message: ko.push_app_only_message }),
    );
    expect(mocks.checkPermissions).not.toHaveBeenCalled();
  });
});
