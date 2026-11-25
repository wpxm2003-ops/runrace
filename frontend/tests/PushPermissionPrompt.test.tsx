// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ko } from "@/lib/i18n/locales/ko";

const mocks = vi.hoisted(() => ({
  pathname: "/challenges/3",
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  track: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor-firebase/messaging", () => ({
  FirebaseMessaging: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
  },
}));
vi.mock("@/lib/i18n", () => ({ useLocale: () => ({ t: ko, locale: "ko" }) }));
vi.mock("@/lib/analytics", () => ({ track: mocks.track }));
vi.mock("@/lib/api", () => ({ reportClientError: vi.fn() }));
vi.mock("@/lib/nativeNav", () => ({ pushBackInterceptor: () => () => {} }));

import { PushPermissionPrompt } from "@/app/_components/PushPermissionPrompt";
import { setPushTokenSyncHandler } from "@/lib/pushPermission";
import { loadPushPromptRecord, snoozePushPrompt, triggerPushPrompt } from "@/lib/pushPrompt";

const DAY = 24 * 60 * 60 * 1000;

async function flush(ms = 700) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);
  });
}

function trackedNames(): string[] {
  return mocks.track.mock.calls.map((call) => call[0] as string);
}

// 시트는 플러그인을 동적 import한다. 첫 로드는 가짜 타이머로 진행되지 않으므로 미리 불러 둔다.
beforeAll(async () => {
  await import("@capacitor-firebase/messaging");
});

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mocks.pathname = "/challenges/3";
  mocks.track.mockReset();
  mocks.checkPermissions.mockReset();
  mocks.requestPermissions.mockReset();
  mocks.checkPermissions.mockResolvedValue({ receive: "prompt" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PushPermissionPrompt", () => {
  it("stays hidden until a meaningful moment happens", async () => {
    render(<PushPermissionPrompt />);
    await flush(5000);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.checkPermissions).not.toHaveBeenCalled();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
  });

  it("shows a short explanation after joining a race, without asking the OS yet", async () => {
    render(<PushPermissionPrompt />);
    act(() => triggerPushPrompt("race_joined"));
    await flush();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(ko.push_prompt_point_overtake)).toBeTruthy();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith("push_prompt_shown", { trigger: "race_joined" });
  });

  it.each(["granted", "denied"])("does not show when the permission is already %s", async (receive) => {
    mocks.checkPermissions.mockResolvedValue({ receive });
    render(<PushPermissionPrompt />);
    act(() => triggerPushPrompt("race_created"));
    await flush();
    expect(mocks.checkPermissions).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trackedNames()).not.toContain("push_prompt_shown");
  });

  it("asks again after one OS denial (rationale state)", async () => {
    mocks.checkPermissions.mockResolvedValue({ receive: "prompt-with-rationale" });
    render(<PushPermissionPrompt />);
    act(() => triggerPushPrompt("race_created"));
    await flush();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("'later' hides it for 7 days", async () => {
    render(<PushPermissionPrompt />);
    act(() => triggerPushPrompt("race_joined"));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: ko.push_prompt_later }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.track).toHaveBeenCalledWith("push_prompt_later", { trigger: "race_joined", via: "button" });
    const snoozedUntil = loadPushPromptRecord()?.snoozedUntil ?? 0;
    expect(snoozedUntil - Date.now()).toBe(7 * DAY);

    act(() => triggerPushPrompt("race_created"));
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trackedNames().filter((n) => n === "push_prompt_shown")).toHaveLength(1);
  });

  it("shows again at the next moment once the 7 days are over", async () => {
    snoozePushPrompt(Date.now() - 7 * DAY);
    render(<PushPermissionPrompt />);
    act(() => triggerPushPrompt("race_joined"));
    await flush();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("treats tapping outside as 'later'", async () => {
    render(<PushPermissionPrompt />);
    act(() => triggerPushPrompt("race_joined"));
    await flush();
    fireEvent.click(screen.getByRole("presentation"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.track).toHaveBeenCalledWith("push_prompt_later", { trigger: "race_joined", via: "dismiss" });
    expect(loadPushPromptRecord()?.snoozedUntil).toBeGreaterThan(Date.now());
  });

  it("asks the OS on 'turn on' and registers the token through the existing path", async () => {
    const sync = vi.fn(async () => true);
    const release = setPushTokenSyncHandler(sync);
    mocks.requestPermissions.mockResolvedValue({ receive: "granted" });
    render(<PushPermissionPrompt />);
    act(() => triggerPushPrompt("race_joined"));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: ko.push_prompt_accept }));
    await flush(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.requestPermissions).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith("push_prompt_accepted", { trigger: "race_joined" });
    expect(mocks.track).toHaveBeenCalledWith("push_permission_result", {
      result: "granted",
      source: "prompt",
      trigger: "race_joined",
    });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(loadPushPromptRecord()?.answered).toBe(true);
    release();
  });

  it("records a denial and does not auto-ask again", async () => {
    const sync = vi.fn(async () => true);
    const release = setPushTokenSyncHandler(sync);
    mocks.requestPermissions.mockResolvedValue({ receive: "prompt-with-rationale" });
    render(<PushPermissionPrompt />);
    act(() => triggerPushPrompt("race_created"));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: ko.push_prompt_accept }));
    await flush(0);
    expect(mocks.track).toHaveBeenCalledWith("push_permission_result", {
      result: "denied",
      source: "prompt",
      trigger: "race_created",
    });
    expect(sync).not.toHaveBeenCalled();

    act(() => triggerPushPrompt("race_joined"));
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    release();
  });

  it("waits until the first-workout celebration leaves the recording screen", async () => {
    mocks.pathname = "/workout";
    const { rerender } = render(<PushPermissionPrompt />);
    act(() => triggerPushPrompt("first_workout"));
    await flush(3000);
    expect(screen.queryByRole("dialog")).toBeNull();

    mocks.pathname = "/workouts/42";
    rerender(<PushPermissionPrompt />);
    await flush();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(mocks.track).toHaveBeenCalledWith("push_prompt_shown", { trigger: "first_workout" });
  });

  it("uses only the first moment when several arrive together", async () => {
    render(<PushPermissionPrompt />);
    act(() => {
      triggerPushPrompt("race_created");
      triggerPushPrompt("race_joined");
    });
    await flush();
    expect(mocks.track).toHaveBeenCalledWith("push_prompt_shown", { trigger: "race_created" });
    expect(trackedNames().filter((n) => n === "push_prompt_shown")).toHaveLength(1);
  });
});
