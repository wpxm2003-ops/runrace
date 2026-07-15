import type { LatLng } from "./workoutTrack";
import { sessionJson } from "./safeStorage";

export type PersistedWorkout = {
  status: "running" | "paused";
  path: LatLng[];
  runStartedAt: number;    // Date.now() when running began
  pausedAccumMs: number;   // total accumulated pause time in ms
  pauseStartedAt: number | null; // timestamp when current pause began
  savedAt: number;         // Date.now() when this snapshot was written
};

/** 24시간 지난 세션은 버린다. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const store = sessionJson<PersistedWorkout>("runrace_workout");

export function saveWorkout(data: Omit<PersistedWorkout, "savedAt">): void {
  store.set({ ...data, savedAt: Date.now() });
}

export function loadWorkout(): PersistedWorkout | null {
  const data = store.get();
  if (!data) return null;
  if (Date.now() - data.savedAt > MAX_AGE_MS) {
    clearWorkout();
    return null;
  }
  return data;
}

export function clearWorkout(): void {
  store.remove();
}

/**
 * 유령 선택 — 러닝 본체(path 등)와 별개 저장소.
 * 백그라운드 전환으로 WebView가 재구성돼도(런 자체는 위 store가 복원) 고른 유령을 잃지 않게
 * id만 저장해두고, 복귀 시 상세를 다시 조회해 복원한다.
 */
const ghostStore = sessionJson<{ workoutId: number }>("runrace_workout_ghost");

export function saveGhostSelection(workoutId: number): void {
  ghostStore.set({ workoutId });
}

export function loadGhostSelection(): number | null {
  return ghostStore.get()?.workoutId ?? null;
}

export function clearGhostSelection(): void {
  ghostStore.remove();
}
