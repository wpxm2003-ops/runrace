import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkout,
  loadWorkoutForOwner,
  saveWorkout,
  type PersistedWorkout,
} from "@/lib/workoutPersistence";

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const baseWorkout: Omit<PersistedWorkout, "savedAt"> = {
  ownerUid: "user-a",
  status: "running",
  path: [{ lat: 37.5, lng: 127, t: 0 }],
  distanceM: 0,
  runStartedAt: Date.parse("2026-07-30T00:00:00Z"),
  pausedAccumMs: 0,
  pauseStartedAt: null,
  idleAnchor: {
    timeMs: Date.parse("2026-07-30T00:00:00Z"),
    distanceM: 0,
    position: { lat: 37.5, lng: 127 },
  },
  autoPaused: false,
};

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { localStorage: unknown }).localStorage = new MemoryStorage();
  (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = new MemoryStorage();
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});

describe("workoutPersistence owner", () => {
  it("같은 Firebase UID만 진행 중 운동을 복원한다", () => {
    saveWorkout(baseWorkout);

    expect(loadWorkoutForOwner("user-a")?.ownerUid).toBe("user-a");
    expect(loadWorkoutForOwner("user-b")).toBeNull();
  });

  it("다른 계정으로 조회해도 원래 소유자의 세션은 보존한다", () => {
    saveWorkout(baseWorkout);

    expect(loadWorkoutForOwner("user-b")).toBeNull();
    expect(loadWorkoutForOwner("user-a")?.path).toEqual(baseWorkout.path);
  });

  it("소유자 정보가 없는 구버전 세션을 현재 계정에 추측 귀속하지 않는다", () => {
    const legacy = { ...baseWorkout, savedAt: Date.now() } as Partial<PersistedWorkout>;
    delete legacy.ownerUid;
    localStorage.setItem("runrace_workout", JSON.stringify(legacy));

    expect(loadWorkoutForOwner("user-a")).toBeNull();
  });

  it("24시간이 지난 세션은 소유자가 맞아도 제거한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T12:00:00Z"));
    localStorage.setItem(
      "runrace_workout",
      JSON.stringify({
        ...baseWorkout,
        savedAt: Date.parse("2026-07-29T11:59:59Z"),
      }),
    );

    expect(loadWorkoutForOwner("user-a")).toBeNull();
    expect(localStorage.getItem("runrace_workout")).toBeNull();
  });

  it("명시적으로 운동을 지우면 어느 계정에서도 복원되지 않는다", () => {
    saveWorkout(baseWorkout);
    clearWorkout();

    expect(loadWorkoutForOwner("user-a")).toBeNull();
  });

  it("이전 앱 버전의 sessionStorage 세션을 localStorage로 옮겨 복원한다", () => {
    sessionStorage.setItem(
      "runrace_workout",
      JSON.stringify({ ...baseWorkout, savedAt: Date.now() }),
    );

    expect(loadWorkoutForOwner("user-a")?.ownerUid).toBe("user-a");
    expect(localStorage.getItem("runrace_workout")).not.toBeNull();
    expect(sessionStorage.getItem("runrace_workout")).toBeNull();
  });
});
