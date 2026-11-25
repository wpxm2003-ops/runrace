// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import type { WeeklyGoalStatus } from "@/lib/api/types";
import { saveWeeklyGoal } from "@/lib/api";
import { track } from "@/lib/analytics";
import { WeeklyGoalCard } from "@/app/_components/WeeklyGoalCard";
import { WeeklyGoalSheet } from "@/app/_components/WeeklyGoalSheet";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/api", () => ({ saveWeeklyGoal: vi.fn() }));
vi.mock("@/lib/useNativeBack", () => ({ useNativeBack: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/lib/i18n", async () => {
  const { ko } = await import("@/lib/i18n/locales/ko");
  return { useLocale: () => ({ t: ko, locale: "ko" }) };
});
vi.mock("@/lib/UnitContext", () => ({ useUnit: () => ({ unit: "km", setUnit: vi.fn() }) }));

function status(overrides: Partial<WeeklyGoalStatus> = {}): WeeklyGoalStatus {
  return {
    goal: null,
    weekStart: "2026-11-23",
    distanceM: 0,
    runs: 0,
    currentStreakDays: 0,
    suggestion: { distanceM: 11_000, runs: 3, fromHistory: true },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("WeeklyGoalCard states", () => {
  it("shows a skeleton while loading and nothing when the request failed", () => {
    const { container, rerender } = render(
      <WeeklyGoalCard status={undefined} loading onOpen={vi.fn()} />,
    );
    expect(screen.getByLabelText("로딩 중...")).toBeTruthy();
    expect(screen.queryByTestId("weekly-goal-card")).toBeNull();

    rerender(<WeeklyGoalCard status={undefined} loading={false} onOpen={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("no goal: invites setting one with the 4-week suggestion and tracks the tap", () => {
    const onOpen = vi.fn();
    render(<WeeklyGoalCard status={status()} loading={false} onOpen={onOpen} />);

    const card = screen.getByTestId("weekly-goal-card");
    expect(card.getAttribute("data-state")).toBe("none");
    expect(card.textContent).toContain("이번 주 목표 정하기");
    expect(card.textContent).toContain("최근 4주 기록 기준 추천: 11 km");
    expect(card.textContent).not.toContain("연속"); // 연속 0일은 노출하지 않는다

    fireEvent.click(card);
    expect(track).toHaveBeenCalledWith("weekly_goal_card_tap", { state: "none" });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("no goal and no history: suggests an easy run-count start", () => {
    render(
      <WeeklyGoalCard
        status={status({ suggestion: { distanceM: 5_000, runs: 2, fromHistory: false }, currentStreakDays: 2 })}
        loading={false}
        onOpen={vi.fn()}
      />,
    );
    const card = screen.getByTestId("weekly-goal-card");
    expect(card.textContent).toContain("가볍게 2회부터 시작해 보세요");
    expect(card.textContent).toContain("2일 연속");
  });

  it("in progress: shows the progress bar, remaining amount and current streak", () => {
    render(
      <WeeklyGoalCard
        status={status({ goal: { type: "DISTANCE", target: 15_000 }, distanceM: 8_200, runs: 2, currentStreakDays: 3 })}
        loading={false}
        onOpen={vi.fn()}
      />,
    );
    const card = screen.getByTestId("weekly-goal-card");
    expect(card.getAttribute("data-state")).toBe("in_progress");
    expect(card.textContent).toContain("이번 주 목표");
    expect(card.textContent).toContain("8.2");
    expect(card.textContent).toContain("/ 15 km");
    expect(card.textContent).toContain("6.8 km 남았어요");
    expect(card.textContent).toContain("3일 연속");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("55");

    fireEvent.click(card);
    expect(track).toHaveBeenCalledWith("weekly_goal_card_tap", { state: "in_progress" });
  });

  it("in progress for a run-count goal", () => {
    render(
      <WeeklyGoalCard
        status={status({ goal: { type: "RUNS", target: 3 }, distanceM: 9_000, runs: 2 })}
        loading={false}
        onOpen={vi.fn()}
      />,
    );
    const card = screen.getByTestId("weekly-goal-card");
    expect(card.textContent).toContain("/ 3회");
    expect(card.textContent).toContain("1회 남았어요");
  });

  it("achieved: celebrates without a remaining amount and fills the bar", () => {
    render(
      <WeeklyGoalCard
        status={status({ goal: { type: "RUNS", target: 3 }, runs: 4, currentStreakDays: 5 })}
        loading={false}
        onOpen={vi.fn()}
      />,
    );
    const card = screen.getByTestId("weekly-goal-card");
    expect(card.getAttribute("data-state")).toBe("achieved");
    expect(card.textContent).toContain("이번 주 목표 달성!");
    expect(card.textContent).not.toContain("남았어요");
    expect(card.textContent).toContain("5일 연속");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });
});

describe("WeeklyGoalSheet", () => {
  const user = { uid: "runner" } as User;

  it("starts from the suggestion, steps the value and saves meters", async () => {
    const saved = status({ goal: { type: "DISTANCE", target: 12_000 } });
    vi.mocked(saveWeeklyGoal).mockResolvedValue(saved);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<WeeklyGoalSheet status={status()} user={user} onClose={onClose} onSaved={onSaved} />);

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("11");
    fireEvent.click(screen.getByLabelText("늘리기"));
    expect(input.value).toBe("12");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "목표 저장" }));
    });

    expect(saveWeeklyGoal).toHaveBeenCalledWith({ type: "DISTANCE", target: 12_000 }, user);
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(onClose).toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("weekly_goal_set", {
      goal_type: "DISTANCE",
      target_value: 12,
      target_unit: "km",
      is_edit: false,
      is_suggestion: false,
    });
  });

  it("edits an existing goal and switches type to the run-count suggestion", async () => {
    vi.mocked(saveWeeklyGoal).mockResolvedValue(status({ goal: { type: "RUNS", target: 3 } }));
    render(
      <WeeklyGoalSheet
        status={status({ goal: { type: "DISTANCE", target: 20_000 } })}
        user={user}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("20");

    fireEvent.click(screen.getByRole("radio", { name: "횟수" }));
    expect(input.value).toBe("3");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "목표 저장" }));
    });
    expect(saveWeeklyGoal).toHaveBeenCalledWith({ type: "RUNS", target: 3 }, user);
    expect(track).toHaveBeenCalledWith("weekly_goal_set", expect.objectContaining({
      goal_type: "RUNS",
      is_edit: true,
      is_suggestion: true,
    }));
  });

  it("keeps the sheet open with an error when saving fails", async () => {
    vi.mocked(saveWeeklyGoal).mockRejectedValue(new Error("offline"));
    const onClose = vi.fn();
    render(<WeeklyGoalSheet status={status()} user={user} onClose={onClose} onSaved={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "목표 저장" }));
    });
    expect(screen.getByRole("alert").textContent).toContain("저장하지 못했어요");
    expect(onClose).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("clamps typed values to the allowed range", () => {
    render(<WeeklyGoalSheet status={status()} user={user} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "횟수" }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.blur(input);
    expect(input.value).toBe("14");
    expect((screen.getByLabelText("늘리기") as HTMLButtonElement).disabled).toBe(true);
  });
});
