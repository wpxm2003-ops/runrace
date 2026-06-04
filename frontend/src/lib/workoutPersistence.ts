import type { LatLng } from "./workoutTrack";

export type PersistedWorkout = {
  status: "running" | "paused";
  path: LatLng[];
  runStartedAt: number;    // Date.now() when running began
  pausedAccumMs: number;   // total accumulated pause time in ms
  pauseStartedAt: number | null; // timestamp when current pause began
  savedAt: number;         // Date.now() when this snapshot was written
};

const KEY = "runrace_workout";
/** 24시간 지난 세션은 버린다. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function saveWorkout(data: Omit<PersistedWorkout, "savedAt">): void {
  try {
    const payload: PersistedWorkout = { ...data, savedAt: Date.now() };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage unavailable or full — ignore
  }
}

export function loadWorkout(): PersistedWorkout | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedWorkout;
    if (Date.now() - data.savedAt > MAX_AGE_MS) {
      clearWorkout();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearWorkout(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
