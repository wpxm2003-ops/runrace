import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingWorkoutSaveIfMatches,
  loadPendingWorkoutSave,
  savePendingWorkoutSave,
  type PendingWorkoutSave,
} from "@/lib/workoutPendingSave";
import type { WorkoutFinishSnapshot } from "@/lib/workoutTrack";

/**
 * 이 프로젝트의 vitest 환경은 "node"(vitest.config.ts)라 window/localStorage가 기본으로는
 * 없다. localJson(safeStorage.ts)이 요구하는 최소 Storage 인터페이스만 메모리로 흉내낸다.
 */
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { localStorage: unknown }).localStorage = new MemoryStorage();
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

function makeSnapshot(clientWorkoutId: string): WorkoutFinishSnapshot {
  return {
    clientWorkoutId,
    startedAt: "2026-07-29T00:00:00.000Z",
    endedAt: "2026-07-29T00:30:00.000Z",
    durationSec: 1800,
    distanceM: 5000,
    calories: 300,
    avgPaceSecPerKm: 360,
    path: [{ lat: 37.5, lng: 127.0, t: 0 }],
  };
}

function makeData(clientWorkoutId: string, ownerUid = "user-a"): PendingWorkoutSave {
  return {
    ownerUid,
    snapshot: makeSnapshot(clientWorkoutId),
    ghostWorkoutId: 1,
    ghostResult: { overlapDistanceM: 500, myTimeMs: 1000, ghostTimeMs: 1100, deltaMs: -100 },
    ghostLabel: "5.0km",
    showNsmCta: false,
    nsmLog: null,
  };
}

describe("workoutPendingSave", () => {
  it("저장 없이는 null을 반환한다", () => {
    expect(loadPendingWorkoutSave("user-a")).toBeNull();
  });

  it("save → load가 왕복된다(같은 uid)", () => {
    const data = makeData("client-workout-1");
    savePendingWorkoutSave(data);
    expect(loadPendingWorkoutSave("user-a")).toEqual(data);
  });

  it("다른 uid로 로드하면 null — 다른 계정 소유 데이터는 노출하지 않는다", () => {
    const data = makeData("client-workout-1", "user-a");
    savePendingWorkoutSave(data);
    expect(loadPendingWorkoutSave("user-b")).toBeNull();
  });

  it("다른 uid로 로드해도 원래 데이터는 지우지 않는다 — 원래 소유자가 나중에 복구할 수 있다", () => {
    const data = makeData("client-workout-1", "user-a");
    savePendingWorkoutSave(data);
    loadPendingWorkoutSave("user-b");
    expect(loadPendingWorkoutSave("user-a")).toEqual(data);
  });

  it("clientWorkoutId가 일치하면 지운다", () => {
    savePendingWorkoutSave(makeData("client-workout-1"));
    clearPendingWorkoutSaveIfMatches("client-workout-1");
    expect(loadPendingWorkoutSave("user-a")).toBeNull();
  });

  it("clientWorkoutId가 다르면 지우지 않는다(다른 미해결 실패 보존)", () => {
    const data = makeData("client-workout-1");
    savePendingWorkoutSave(data);
    clearPendingWorkoutSaveIfMatches("client-workout-2");
    expect(loadPendingWorkoutSave("user-a")).toEqual(data);
  });

  it("보관된 게 없을 때 지워도 에러 없이 아무 일도 없다", () => {
    expect(() => clearPendingWorkoutSaveIfMatches("client-workout-1")).not.toThrow();
    expect(loadPendingWorkoutSave("user-a")).toBeNull();
  });
});
