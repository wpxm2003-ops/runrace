import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: true,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocks.native },
}));
vi.mock("@capacitor-firebase/messaging", () => ({
  FirebaseMessaging: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
  },
}));

import {
  checkNotificationPermission,
  normalizeNotificationPermission,
  notifyPushTokenRegistered,
  onPushTokenRegistered,
  permissionResultLabel,
  requestNotificationPermission,
  requestPushTokenSync,
  setPushTokenSyncHandler,
} from "@/lib/pushPermission";

beforeEach(() => {
  mocks.native = true;
  mocks.checkPermissions.mockReset();
  mocks.requestPermissions.mockReset();
});

describe("normalizeNotificationPermission", () => {
  it("keeps granted and denied", () => {
    expect(normalizeNotificationPermission("granted")).toBe("granted");
    expect(normalizeNotificationPermission("denied")).toBe("denied");
  });

  it("treats a single Android 13 denial (rationale) as askable", () => {
    expect(normalizeNotificationPermission("prompt-with-rationale")).toBe("prompt");
    expect(normalizeNotificationPermission("prompt")).toBe("prompt");
    expect(normalizeNotificationPermission(undefined)).toBe("prompt");
  });

  it("reports anything but granted as denied for analytics", () => {
    expect(permissionResultLabel("granted")).toBe("granted");
    expect(permissionResultLabel("prompt")).toBe("denied");
    expect(permissionResultLabel("denied")).toBe("denied");
  });
});

describe("check / request", () => {
  it("checks without opening the OS dialog", async () => {
    mocks.checkPermissions.mockResolvedValue({ receive: "prompt" });
    await expect(checkNotificationPermission()).resolves.toBe("prompt");
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
  });

  it("requests and normalizes the answer", async () => {
    mocks.requestPermissions.mockResolvedValue({ receive: "prompt-with-rationale" });
    await expect(requestNotificationPermission()).resolves.toBe("prompt");
    mocks.requestPermissions.mockResolvedValue({ receive: "granted" });
    await expect(requestNotificationPermission()).resolves.toBe("granted");
  });

  it("is unsupported on the web and never touches the plugin", async () => {
    mocks.native = false;
    await expect(checkNotificationPermission()).resolves.toBe("unsupported");
    await expect(requestNotificationPermission()).resolves.toBe("unsupported");
    expect(mocks.checkPermissions).not.toHaveBeenCalled();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
  });
});

describe("token sync bridge", () => {
  it("returns false when nobody can sync (logged out)", async () => {
    await expect(requestPushTokenSync()).resolves.toBe(false);
  });

  it("calls the registered handler and reports its result", async () => {
    const release = setPushTokenSyncHandler(async () => true);
    await expect(requestPushTokenSync()).resolves.toBe(true);
    release();
    await expect(requestPushTokenSync()).resolves.toBe(false);
  });

  it("swallows handler failures", async () => {
    const release = setPushTokenSyncHandler(() => Promise.reject(new Error("fcm")));
    await expect(requestPushTokenSync()).resolves.toBe(false);
    release();
  });

  it("does not let a stale release remove a newer handler", async () => {
    const releaseOld = setPushTokenSyncHandler(async () => false);
    const releaseNew = setPushTokenSyncHandler(async () => true);
    releaseOld();
    await expect(requestPushTokenSync()).resolves.toBe(true);
    releaseNew();
  });

  it("notifies registration listeners even if one throws", () => {
    const releaseBroken = onPushTokenRegistered(() => {
      throw new Error("boom");
    });
    const listener = vi.fn();
    const release = onPushTokenRegistered(listener);
    expect(() => notifyPushTokenRegistered()).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
    releaseBroken();
    release();
    notifyPushTokenRegistered();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
