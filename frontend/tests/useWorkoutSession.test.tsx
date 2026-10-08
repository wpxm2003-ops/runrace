// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import type { WorkoutStartFix } from "@/lib/workoutTrack";
import { useWorkoutSession } from "@/lib/useWorkoutSession";

const mocks = vi.hoisted(() => ({
  startWatch: vi.fn(),
  stopWatch: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  live: {
    liveRivalGaps: [], sendLivePing: vi.fn(), pauseLiveRun: vi.fn(),
    discardLiveRun: vi.fn(), clearLiveRivalGaps: vi.fn(),
  },
  warmup: { current: [] as WorkoutStartFix[] },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/workout" }));
vi.mock("@/lib/UnitContext", () => ({ useUnit: () => ({ unit: "km" }) }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: mocks.addListener } }));
vi.mock("@/lib/nativePermissions", () => ({ waitForNativePermissions: () => Promise.resolve() }));
vi.mock("@/lib/backgroundGeo", () => ({ startBackgroundWatch: mocks.startWatch }));
vi.mock("@/lib/useWorkoutLiveProgress", () => ({ useWorkoutLiveProgress: () => mocks.live }));
vi.mock("@/lib/useWorkoutGpsWarmup", () => ({ useWorkoutGpsWarmup: () => mocks.warmup }));
vi.mock("@/lib/useWorkoutPersistenceFlush", () => ({ useWorkoutPersistenceFlush: () => {} }));

const user = { uid: "runner" } as User;
const auth = { currentUid: user.uid, loading: false, user };
function seed() {
  mocks.warmup.current = [{
    ownerUid: user.uid, lat: 37.5, lng: 127, accuracyM: 5,
    fixAtMs: Date.now(), receivedAtMs: Date.now(),
  }];
}
function renderSession() {
  return renderHook(({ title }) => useWorkoutSession(
    { title, message: "Tracking" }, auth,
  ), { initialProps: { title: "Workout" } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true, value: { getCurrentPosition: vi.fn() },
  });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  mocks.startWatch.mockResolvedValue(mocks.stopWatch);
  mocks.addListener.mockResolvedValue({ remove: mocks.removeListener });
  seed();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("workout session runtime", () => {
  it("recovers a stale watch despite a render every second", async () => {
    const { result } = renderSession();
    await act(async () => { result.current.start(user.uid); });
    expect(mocks.startWatch).toHaveBeenCalledTimes(1);
    for (let second = 0; second < 15; second++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    }
    expect(result.current.elapsedSec).toBe(15);
    expect(mocks.startWatch).toHaveBeenCalledTimes(2);
    expect(mocks.addListener).toHaveBeenCalledTimes(1);
    expect(mocks.removeListener).not.toHaveBeenCalled();
  });

  it("uses changed notification text on the next watch start", async () => {
    const { result, rerender } = renderSession();
    await act(async () => { result.current.start(user.uid); });
    act(() => result.current.pause(user.uid));
    rerender({ title: "운동 중" });
    await act(async () => { result.current.resume(user.uid); });
    expect(mocks.startWatch.mock.lastCall?.slice(2)).toEqual(["운동 중", "Tracking"]);
  });

  it.each(["success", "failure"])("ignores a previous workout's late gap check (%s)", async (response) => {
    const { result } = renderSession();
    await act(async () => { result.current.start(user.uid); });
    // 잠든 WebView처럼 타이머 없이 벽시계만 진행시킨 뒤 포그라운드로 복귀한다.
    vi.setSystemTime(Date.now() + 31 * 60_000);
    const foreground = mocks.addListener.mock.lastCall![1];
    await act(async () => { foreground({ isActive: true }); });
    const [success, failure] = vi.mocked(navigator.geolocation.getCurrentPosition).mock.lastCall!;
    act(() => { result.current.stop(user.uid); });
    seed();
    const newStartedAt = Date.now();
    await act(async () => { result.current.start(user.uid); });
    vi.setSystemTime(newStartedAt + 10_000);
    act(() => {
      if (response === "success") {
        success({ coords: { latitude: 38, longitude: 128 } } as GeolocationPosition);
      } else {
        failure!({ code: 3 } as GeolocationPositionError);
      }
    });
    vi.setSystemTime(newStartedAt + 30 * 60_000 - 1000);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    // 예전 응답이 새 앵커를 10초 늦췄다면 여기서 아직 running이 된다.
    expect(result.current.status).toBe("paused");
    expect(result.current.autoPaused).toBe(true);
  });
});
