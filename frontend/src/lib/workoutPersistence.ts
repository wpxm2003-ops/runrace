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
