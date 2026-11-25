import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: true,
  available: true,
  open: vi.fn(),
  registerPlugin: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mocks.native,
    isPluginAvailable: (name: string) => mocks.available && name === "AppNotificationSettings",
  },
  registerPlugin: mocks.registerPlugin,
}));

import { openAppNotificationSettings } from "@/lib/appNotificationSettings";

beforeEach(() => {
  mocks.native = true;
  mocks.available = true;
  mocks.open.mockReset();
  mocks.registerPlugin.mockReset();
  mocks.registerPlugin.mockReturnValue({ open: mocks.open });
});

describe("openAppNotificationSettings", () => {
  it("opens the OS notification settings on an APK with the plugin", async () => {
    mocks.open.mockResolvedValue({ screen: "notifications" });
    await expect(openAppNotificationSettings()).resolves.toBe("opened");
    expect(mocks.open).toHaveBeenCalledTimes(1);
  });

  it("falls back on an older APK without the plugin, without calling it", async () => {
    mocks.available = false;
    await expect(openAppNotificationSettings()).resolves.toBe("unavailable");
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("falls back when the native call fails", async () => {
    mocks.open.mockRejectedValue(new Error("settings_unavailable"));
    await expect(openAppNotificationSettings()).resolves.toBe("unavailable");
  });

  it("is unavailable on the web", async () => {
    mocks.native = false;
    await expect(openAppNotificationSettings()).resolves.toBe("unavailable");
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
