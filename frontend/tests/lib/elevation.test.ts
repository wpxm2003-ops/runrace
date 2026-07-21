import { describe, expect, it } from "vitest";
import { computeElevationStats } from "@/lib/elevation";
import type { LatLng } from "@/lib/workoutTrack";

function point(lng: number, ele?: number): LatLng {
  return ele == null ? { lat: 37, lng } : { lat: 37, lng, ele };
}

describe("computeElevationStats", () => {
  it("returns null when the path has no elevation data", () => {
    expect(computeElevationStats([point(127), point(127.001), point(127.002)])).toBeNull();
  });

  it("calculates an elevation profile and min/max values", () => {
    const stats = computeElevationStats([
      point(127, 10),
      point(127.001, 40),
      point(127.002, 80),
      point(127.003, 60),
      point(127.004, 20),
    ]);

    expect(stats).not.toBeNull();
    expect(stats!.profile).toHaveLength(5);
    expect(stats!.maxElevationM).toBeGreaterThan(stats!.minElevationM);
    expect(stats!.totalAscentM).toBeGreaterThan(0);
    expect(stats!.totalDescentM).toBeGreaterThanOrEqual(0);
  });
});
