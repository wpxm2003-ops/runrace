// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import type { TrainingPlan } from "@/lib/api/types/training";
import type { Translations } from "@/lib/i18n/translations";
import { useTrainingPlanBuilder } from "@/app/training/_hooks/useTrainingPlanBuilder";

const server = vi.hoisted(() => ({ plan: undefined as TrainingPlan | null | undefined }));
vi.mock("@/lib/api", () => ({
  useTrainingPlan: () => ({ data: server.plan, mutate: vi.fn() }),
  useNsmWeeklyProgress: () => ({ data: undefined }),
  usePersonalBests: () => ({ data: [] }),
  saveTrainingPlan: vi.fn(), cancelTrainingPlan: vi.fn(),
}));
vi.mock("@/app/_components/ConfirmProvider", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/auth", () => ({ redirectToLogin: vi.fn() }));
const user = { uid: "runner" } as User;
const t = { nsm_time_error: "Invalid time" } as Translations;
const saved: TrainingPlan = {
  vdot: 50, thresholdPaceSec: 260, subTDays: [2, 4],
  sourceDistanceM: 10000, sourceTimeSec: 2700, weeklyBand: 3,
};
type Builder = ReturnType<typeof useTrainingPlanBuilder>;
beforeEach(() => { server.plan = undefined; sessionStorage.clear(); });
afterEach(cleanup);
function renderBuilder() { return renderHook(() => useTrainingPlanBuilder(user, t)); }

describe("training plan hydration", () => {
  it("restores a late server plan when the editor is untouched", () => {
    const { result, rerender } = renderBuilder();
    expect(result.current.result).toBeNull();
    server.plan = saved;
    rerender();
    expect(result.current.distM).toBe(10000);
    expect(result.current.timeStr).toBe("45:00");
    expect(result.current.isSaved).toBe(true);
  });

  const edits: [string, (builder: Builder) => void][] = [
    ["distance", (b) => b.setDistM(21097)],
    ["time", (b) => b.setTimeStr("24:00")],
    ["volume", (b) => b.selectBand(1)],
    ["days", (b) => b.toggleDay(5)],
    ["calculation", (b) => b.calculate()],
  ];
  it.each(edits)("preserves %s edits made while the server is loading", (_, edit) => {
    const { result, rerender } = renderBuilder();
    act(() => edit(result.current));
    const before = result.current;
    server.plan = saved;
    rerender();
    expect(result.current.distM).toBe(before.distM);
    expect(result.current.timeStr).toBe(before.timeStr);
    expect(result.current.band).toBe(before.band);
    expect(result.current.subTDays).toEqual(before.subTDays);
    expect(result.current.result).toEqual(before.result);
    expect(result.current.savedPlan).toEqual(saved);
  });

  it.each([false, true])("keeps the login draft ahead of a server plan (cached=%s)", (cached) => {
    sessionStorage.setItem("nsm_calc_draft", JSON.stringify({
      distM: 5000, timeStr: "24:00", subTDays: [1, 3], band: 2,
    }));
    if (cached) server.plan = saved;
    const { result, rerender } = renderBuilder();
    server.plan = saved;
    rerender();
    expect(result.current.distM).toBe(5000);
    expect(result.current.timeStr).toBe("24:00");
    expect(result.current.result).not.toBeNull();
    expect(sessionStorage.getItem("nsm_calc_draft")).toBeNull();
  });
});
