// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import type { WorkoutSessionValue } from "@/lib/WorkoutSessionProvider";
import type { DistanceUnit } from "@/lib/units";
import { formatDistance } from "@/lib/units";
import { useWorkoutGhostRace } from "@/app/workout/_components/useWorkoutGhostRace";
import { fetchWorkout } from "@/lib/api";
import { loadGhostSelection, saveGhostSelection } from "@/lib/workoutPersistence";

vi.mock("@/lib/api", () => ({ fetchWorkout: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
const user = { uid: "runner" } as User;
const session = { status: "idle", elapsedSec: 0, distanceM: 0 } as WorkoutSessionValue;
const detail = { id: 1, distanceM: 5000, durationSec: 1500, path: [] } as unknown as Awaited<ReturnType<typeof fetchWorkout>>;
const next = { id: 2, label: "next", distanceM: 3000, path: [] };
function deferred() {
  let resolve!: (value: typeof detail) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<typeof detail>((yes, no) => { resolve = yes; reject = no; });
  vi.mocked(fetchWorkout).mockReturnValue(promise);
  return { resolve, reject };
}
function renderGhost() {
  return renderHook(({ currentUser, unit }) => useWorkoutGhostRace(currentUser, unit, session), {
    initialProps: { currentUser: user as User | null, unit: "km" as DistanceUnit },
    wrapper: StrictMode,
  });
}
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); saveGhostSelection(1); });
afterEach(cleanup);

describe("ghost restore ordering", () => {
  it("does not overwrite a new choice with an old response", async () => {
    const request = deferred();
    const { result } = renderGhost();
    act(() => result.current.select(next));
    await act(async () => request.resolve(detail));
    expect(result.current.ghost?.id).toBe(2);
    expect(loadGhostSelection()).toBe(2);
  });
  it("does not restore after clearing", async () => {
    const request = deferred();
    const { result } = renderGhost();
    act(() => result.current.clear());
    await act(async () => request.resolve(detail));
    expect(result.current.ghost).toBeNull();
    expect(loadGhostSelection()).toBeNull();
  });
  it("does not clear a new choice when an old request fails", async () => {
    const request = deferred();
    const { result } = renderGhost();
    act(() => result.current.select(next));
    await act(async () => request.reject(new Error("late failure")));
    expect(loadGhostSelection()).toBe(2);
  });
  it("ignores an old user's response after logout", async () => {
    const request = deferred();
    const { result, rerender } = renderGhost();
    rerender({ currentUser: null, unit: "km" });
    await act(async () => request.resolve(detail));
    expect(result.current.ghost).toBeNull();
  });
  it("restores in StrictMode and changes units without refetching", async () => {
    const request = deferred();
    const { result, rerender } = renderGhost();
    await act(async () => request.resolve(detail));
    expect(result.current.ghost?.id).toBe(1);
    const calls = vi.mocked(fetchWorkout).mock.calls.length;
    rerender({ currentUser: user, unit: "mi" });
    expect(fetchWorkout).toHaveBeenCalledTimes(calls);
    expect(result.current.ghost?.label).toBe(formatDistance(5000, "mi"));
  });
});
