import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkout,
  loadWorkoutForOwner,
  purgeExpiredWorkout,
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
  clientWorkoutId: "run-a",
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
  it("라이브 핑과 최종 저장에 쓸 런 식별자를 그대로 복원한다", () => {
    saveWorkout(baseWorkout);

    expect(loadWorkoutForOwner("user-a")?.clientWorkoutId).toBe("run-a");
  });

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

/** 웹은 탭을 여러 개 열 수 있는데 저장 키는 하나뿐이다. */
describe("workoutPersistence 다중 탭", () => {
  it("살아있는 다른 런의 스냅샷을 덮어쓰지 않는다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00Z"));
    saveWorkout(baseWorkout);

    // 20초 뒤 다른 탭이 자기 런을 저장하려 한다 — 아직 살아있으므로 자리를 뺏지 못한다.
    vi.setSystemTime(new Date("2026-07-30T00:00:20Z"));
    saveWorkout({ ...baseWorkout, runStartedAt: baseWorkout.runStartedAt + 1_000 });

    expect(loadWorkoutForOwner("user-a")?.runStartedAt).toBe(baseWorkout.runStartedAt);
  });

  it("같은 런은 계속 갱신한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00Z"));
    saveWorkout(baseWorkout);

    vi.setSystemTime(new Date("2026-07-30T00:00:20Z"));
    saveWorkout({ ...baseWorkout, distanceM: 500 });

    expect(loadWorkoutForOwner("user-a")?.distanceM).toBe(500);
  });

  it("침묵한 스냅샷은 다른 런이 이어받는다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00Z"));
    saveWorkout(baseWorkout);

    // 저장 주기(10초)를 여섯 번 넘겨 침묵 — 그 탭은 닫힌 것으로 본다.
    vi.setSystemTime(new Date("2026-07-30T00:01:30Z"));
    const later = baseWorkout.runStartedAt + 1_000;
    saveWorkout({ ...baseWorkout, runStartedAt: later });

    expect(loadWorkoutForOwner("user-a")?.runStartedAt).toBe(later);
  });
});

describe("purgeExpiredWorkout", () => {
  it("인증·소유자와 무관하게 만료된 스냅샷을 지운다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00Z"));
    saveWorkout(baseWorkout);

    vi.setSystemTime(new Date("2026-07-31T00:00:01Z"));
    purgeExpiredWorkout();

    expect(localStorage.getItem("runrace_workout")).toBeNull();
  });

  it("만료 전이면 건드리지 않는다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00Z"));
    saveWorkout(baseWorkout);

    vi.setSystemTime(new Date("2026-07-30T23:00:00Z"));
    purgeExpiredWorkout();

    expect(loadWorkoutForOwner("user-a")?.ownerUid).toBe("user-a");
  });
});
