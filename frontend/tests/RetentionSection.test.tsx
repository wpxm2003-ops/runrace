// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import type { AdminRetention, AdminRetentionRates } from "@/lib/api";
import { getAdminRetention } from "@/lib/api";
import { RetentionSection } from "@/app/sb/_components/RetentionSection";

vi.mock("@/lib/api", () => ({ getAdminRetention: vi.fn() }));

const user = { uid: "admin" } as User;
const empty: AdminRetentionRates = {
  d1: { eligible: 0, retained: 0 },
  d7: { eligible: 0, retained: 0 },
  d30: { eligible: 0, retained: 0 },
};

/** 백엔드 RetentionMetricsPostgresTest의 시드 시나리오가 내는 응답과 같은 숫자. */
const seeded: AdminRetention = {
  referenceDate: "2026-11-25",
  referenceTimeZone: "Asia/Seoul",
  visitCollectionStartDate: "2026-11-20",
  newSignups7d: 3,
  visits: { dau: 3, avgDau7d: 1.75, avgDauDays: 4, wau: 5, mau: 5 },
  runs: { dau: 3, avgDau7d: 2 / 7, avgDauDays: 7, wau: 4, mau: 6 },
  cohorts: [
    {
      weekStart: "2026-11-23",
      weekEnd: "2026-11-29",
      size: 1,
      visits: { ...empty, d1: { eligible: 1, retained: 1 } },
      runs: { ...empty, d1: { eligible: 1, retained: 0 } },
    },
    {
      weekStart: "2026-11-16",
      weekEnd: "2026-11-22",
      size: 4,
      visits: { d1: { eligible: 1, retained: 1 }, d7: { eligible: 2, retained: 1 }, d30: { eligible: 0, retained: 0 } },
      runs: { d1: { eligible: 4, retained: 2 }, d7: { eligible: 2, retained: 1 }, d30: { eligible: 0, retained: 0 } },
    },
  ],
};

function panel(title: string): HTMLElement {
  return screen.getByRole("heading", { name: title }).parentElement as HTMLElement;
}

function stat(container: HTMLElement, label: string): HTMLElement {
  return within(container).getByText(label).parentElement as HTMLElement;
}

beforeEach(() => {
  vi.mocked(getAdminRetention).mockReset();
});
afterEach(cleanup);

describe("/sb 재방문 지표 카드", () => {
  it("방문·달리기 기준 카드를 나란히 보여 준다", async () => {
    vi.mocked(getAdminRetention).mockResolvedValue(seeded);

    render(<RetentionSection user={user} />);

    await screen.findByText("방문 기준");
    expect(screen.getByText("3명")).toBeTruthy();
    expect(screen.getByText(/기준일 2026-11-25 \(Asia\/Seoul\)/)).toBeTruthy();

    const visits = panel("방문 기준");
    expect(within(visits).getByText(/2026-11-20부터 수집, 6일째/)).toBeTruthy();
    expect(within(stat(visits, "오늘 DAU")).getByText("3")).toBeTruthy();
    const visitAvg = stat(visits, "최근 7일 평균 DAU");
    expect(within(visitAvg).getByText("1.8")).toBeTruthy();
    expect(within(visitAvg).getByText("어제까지 4일 평균")).toBeTruthy();
    // 수집 6일째라 WAU·MAU는 부분값 표시
    expect(within(stat(visits, "WAU (7일)")).getByText("수집 7일 미만 — 부분값")).toBeTruthy();
    expect(within(stat(visits, "MAU (30일)")).getByText("수집 30일 미만 — 부분값")).toBeTruthy();

    const runs = panel("달리기 기준");
    const runAvg = stat(runs, "최근 7일 평균 DAU");
    expect(within(runAvg).getByText("0.3")).toBeTruthy();
    expect(within(runAvg).getByText("어제까지 7일 평균")).toBeTruthy();
    expect(within(stat(runs, "WAU (7일)")).getByText("4")).toBeTruthy();
    expect(within(stat(runs, "MAU (30일)")).getByText("6")).toBeTruthy();
    expect(within(runs).queryByText(/부분값/)).toBeNull();
  });

  it("코호트 표는 D1/D7/D30을 방문·달리기 순서로, 판정 불가 칸은 —로 보여 준다", async () => {
    vi.mocked(getAdminRetention).mockResolvedValue(seeded);

    render(<RetentionSection user={user} />);

    const row = (await screen.findByText("11/16~11/22")).closest("tr") as HTMLElement;
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toEqual([
      "11/16~11/22",
      "4명",
      "100% (1/1)",
      "50% (2/4)",
      "50% (1/2)",
      "50% (1/2)",
      "—",
      "—",
    ]);
    // 정의를 화면에 적는다
    expect(screen.getByText(/가입 후 정확히 n일째/)).toBeTruthy();
  });

  it("방문 기록이 아직 없으면 평균을 0이 아니라 —로 보여 준다", async () => {
    vi.mocked(getAdminRetention).mockResolvedValue({
      ...seeded,
      visitCollectionStartDate: null,
      visits: { dau: 0, avgDau7d: null, avgDauDays: 0, wau: 0, mau: 0 },
    });

    render(<RetentionSection user={user} />);

    await screen.findByText("방문 기준");
    const visits = panel("방문 기준");
    expect(within(visits).getByText(/아직 수집된 방문 기록이 없음/)).toBeTruthy();
    expect(within(stat(visits, "최근 7일 평균 DAU")).getByText("—")).toBeTruthy();
  });

  it("집계를 못 불러와도 오류 문구만 보이고 나머지 화면은 막지 않는다", async () => {
    vi.mocked(getAdminRetention).mockRejectedValue(new Error("500"));

    render(<RetentionSection user={user} />);

    expect(await screen.findByText("재방문 지표를 불러오지 못했습니다.")).toBeTruthy();
  });
});
