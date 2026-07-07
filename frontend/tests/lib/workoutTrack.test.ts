import { describe, expect, it } from "vitest";
import {
  estimateCalories,
  formatDuration,
  pathBoundsKey,
  splitPathAtGaps,
} from "@/lib/workoutTrack";
import type { LatLng } from "@/lib/workoutTrack";

describe("formatDuration", () => {
  it("1시간 미만은 mm:ss", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(5)).toBe("00:05");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3599)).toBe("59:59");
  });
  it("1시간 이상은 h:mm:ss", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
  it("음수는 0으로 클램프", () => {
    expect(formatDuration(-5)).toBe("00:00");
  });
});

describe("estimateCalories", () => {
  it("km당 약 65kcal(반올림)", () => {
    expect(estimateCalories(0)).toBe(0);
    expect(estimateCalories(1000)).toBe(65);
    expect(estimateCalories(5000)).toBe(325);
  });
});

describe("splitPathAtGaps", () => {
  // 위도 0.001° ≈ 111m — 연속 구간 시뮬레이션
  const close = (lat: number): LatLng => ({ lat, lng: 0 });
  // 위도 1° ≈ 111km — GAP_THRESHOLD_M(120m)를 훌쩍 넘는 점프
  const far = (lat: number): LatLng => ({ lat, lng: 0 });

  it("끊김 없는 경로는 하나의 실선, 점선 없음", () => {
    const path = [close(0), close(0.001), close(0.002)];
    const { solidLines, gapLines } = splitPathAtGaps(path);
    expect(solidLines).toEqual([path]);
    expect(gapLines).toEqual([]);
  });

  it("큰 점프가 있으면 실선을 끊고 점선 구간을 만든다", () => {
    const path = [close(0), close(0.001), far(1), far(1.001)];
    const { solidLines, gapLines } = splitPathAtGaps(path);
    expect(solidLines).toEqual([[path[0], path[1]], [path[2], path[3]]]);
    expect(gapLines).toEqual([[path[1], path[2]]]);
  });

  it("점 1개짜리 잔여 구간은 실선에 포함하지 않는다", () => {
    const path = [close(0), close(0.001), far(1)];
    const { solidLines, gapLines } = splitPathAtGaps(path);
    expect(solidLines).toEqual([[path[0], path[1]]]);
    expect(gapLines).toEqual([[path[1], path[2]]]);
  });

  it("빈 경로·단일 점은 실선·점선 모두 없음", () => {
    expect(splitPathAtGaps([])).toEqual({ solidLines: [], gapLines: [] });
    expect(splitPathAtGaps([close(0)])).toEqual({ solidLines: [], gapLines: [] });
  });

  it("커스텀 임계값을 적용할 수 있다", () => {
    // 0.0005° ≈ 55.5m — 기본 120m 임계값으로는 끊기지 않지만 50m로는 끊긴다
    const path = [close(0), close(0.0005)];
    expect(splitPathAtGaps(path).gapLines).toEqual([]);
    expect(splitPathAtGaps(path, 50).gapLines).toEqual([path]);
  });
});

describe("pathBoundsKey", () => {
  it("빈 경로는 빈 문자열", () => {
    expect(pathBoundsKey([])).toBe("");
  });

  it("길이·시작점·끝점이 같으면 동일한 키", () => {
    const a: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
    const b: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 9, lng: 9 }, { lat: 2, lng: 2 }];
    expect(pathBoundsKey(a)).toBe(pathBoundsKey(b));
  });

  it("끝점이 다르면 다른 키", () => {
    const a: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 2, lng: 2 }];
    const b: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 3, lng: 3 }];
    expect(pathBoundsKey(a)).not.toBe(pathBoundsKey(b));
  });
});
