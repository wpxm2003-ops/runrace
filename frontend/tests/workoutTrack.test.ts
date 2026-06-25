import { describe, expect, it } from "vitest";
import { computeBestSegments } from "@/lib/workoutTrack";
import type { LatLng } from "@/lib/workoutTrack";

/**
 * 적도 위 직선 경로를 생성한다.
 * stepDeg: 스텝당 경도 증분 (0.001° ≈ 111.32m)
 * msPerStep: 각 스텝에서 다음 스텝까지 걸리는 시간(ms)
 */
function buildPath(count: number, stepDeg: number, msPerStep: (i: number) => number): LatLng[] {
  const pts: LatLng[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    pts.push({ lat: 0, lng: i * stepDeg, t });
    t += msPerStep(i);
  }
  return pts;
}

describe("computeBestSegments", () => {
  it("t 없는 경로는 빈 객체 반환", () => {
    const path: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.1 }];
    expect(computeBestSegments(path)).toEqual({});
  });

  it("3km 미만 경로는 어떤 버킷도 반환하지 않음", () => {
    // 20 points × 0.001° ≈ 20 × 111m = 2,200m
    const path = buildPath(20, 0.001, () => 30_000);
    const result = computeBestSegments(path);
    expect(result["3k"]).toBeUndefined();
    expect(result["5k"]).toBeUndefined();
  });

  it("균일 페이스 10km — 5k 페이스가 전체 평균 페이스에 근접", () => {
    // 90 points × 0.001° ≈ 89 × 111.32m ≈ 9,907m
    // 30 sec/step, 1 step ≈ 111.32m → pace ≈ 30/0.11132 ≈ 270 sec/km
    const path = buildPath(90, 0.001, () => 30_000);
    const result = computeBestSegments(path);
    expect(result["5k"]).toBeDefined();
    expect(result["10k"]).toBeUndefined(); // 9.9km이라 10k 버킷 없음
    // ±15 sec/km 허용 (보간 오차)
    expect(result["5k"]).toBeGreaterThan(255);
    expect(result["5k"]).toBeLessThan(285);
  });

  it("중간 구간이 더 빠를 때 전체 평균보다 낮은 페이스를 반환", () => {
    // 90 points × 0.001° ≈ 9,907m
    // steps 0-29: slow — 40 sec/step (≈ 360 sec/km)
    // steps 29-74: fast — 24 sec/step (≈ 216 sec/km)  45 steps ≈ 5.0km
    // steps 74-89: slow — 40 sec/step
    const path = buildPath(90, 0.001, (i) => (i >= 29 && i < 74 ? 24_000 : 40_000));
    const result = computeBestSegments(path);
    expect(result["5k"]).toBeDefined();
    // 전체 평균은 slow가 섞여 있어 ~270 이상이지만 베스트 5k는 fast 구간이라 더 낮아야 함
    expect(result["5k"]).toBeLessThan(250);
    expect(result["5k"]).toBeGreaterThan(180);
  });

  it("10km 초과 경로에서 5k와 10k 모두 반환", () => {
    // 110 points × 0.001° ≈ 12.2km
    const path = buildPath(110, 0.001, () => 30_000);
    const result = computeBestSegments(path);
    expect(result["5k"]).toBeDefined();
    expect(result["10k"]).toBeDefined();
    expect(result["half"]).toBeUndefined();
    // 균일 페이스면 10k 페이스가 5k 페이스와 비슷해야 함
    expect(Math.abs(result["10k"]! - result["5k"]!)).toBeLessThan(15);
  });

  it("빈 배열은 빈 객체 반환", () => {
    expect(computeBestSegments([])).toEqual({});
  });
});
