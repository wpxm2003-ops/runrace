import { describe, expect, it } from "vitest";
import { normalizePath, type PathPoint } from "@/lib/routePath";

describe("normalizePath", () => {
  it("빈 경로는 빈 배열", () => {
    expect(normalizePath([], 100, 100, 10)).toEqual([]);
  });

  it("가로 직선을 박스 안에 종횡비 유지하며 배치", () => {
    const pts = normalizePath(
      [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
      ],
      100,
      100,
      10,
    );
    expect(pts).toHaveLength(2);
    // x: 양 끝이 padding ~ width-padding 으로 펴진다
    expect(pts[0][0]).toBeCloseTo(10, 3);
    expect(pts[1][0]).toBeCloseTo(90, 3);
    // y: 위도 변화가 없으므로 세로 중앙에 모인다
    expect(pts[0][1]).toBeCloseTo(50, 2);
    expect(pts[1][1]).toBeCloseTo(50, 2);
  });

  it("모든 좌표가 박스(0~width, 0~height) 안에 들어온다", () => {
    const path: PathPoint[] = [
      { lat: 37.5, lng: 127.0 },
      { lat: 37.51, lng: 127.02 },
      { lat: 37.49, lng: 127.03 },
      { lat: 37.505, lng: 127.01 },
    ];
    const W = 400;
    const H = 260;
    const PAD = 24;
    const pts = normalizePath(path, W, H, PAD);
    expect(pts).toHaveLength(path.length);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(PAD - 1e-6);
      expect(x).toBeLessThanOrEqual(W - PAD + 1e-6);
      expect(y).toBeGreaterThanOrEqual(PAD - 1e-6);
      expect(y).toBeLessThanOrEqual(H - PAD + 1e-6);
    }
  });
});
