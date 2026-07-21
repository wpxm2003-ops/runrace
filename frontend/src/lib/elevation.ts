import { haversineMeters, type LatLng } from "./workoutTrack";

export type ElevationProfilePoint = {
  distanceM: number;
  elevationM: number;
};

export type ElevationStats = {
  totalAscentM: number;
  totalDescentM: number;
  minElevationM: number;
  maxElevationM: number;
  profile: ElevationProfilePoint[];
};

const MIN_VALID_POINTS = 3;
const MIN_ELEVATION_DELTA_M = 3;

function validElevation(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && value > -500 && value < 9000;
}

function smoothProfile(points: ElevationProfilePoint[]): ElevationProfilePoint[] {
  return points.map((point, index) => {
    const from = Math.max(0, index - 2);
    const to = Math.min(points.length - 1, index + 2);
    let sum = 0;
    let count = 0;
    for (let i = from; i <= to; i++) {
      sum += points[i].elevationM;
      count++;
    }
    return { ...point, elevationM: sum / count };
  });
}

export function computeElevationStats(path: LatLng[]): ElevationStats | null {
  const profile: ElevationProfilePoint[] = [];
  let distanceM = 0;

  for (let i = 0; i < path.length; i++) {
    if (i > 0) distanceM += haversineMeters(path[i - 1], path[i]);
    const elevationM = path[i].ele;
    if (validElevation(elevationM)) {
      profile.push({ distanceM, elevationM });
    }
  }

  if (profile.length < MIN_VALID_POINTS) return null;

  const smoothed = smoothProfile(profile);
  let totalAscentM = 0;
  let totalDescentM = 0;
  let minElevationM = smoothed[0].elevationM;
  let maxElevationM = smoothed[0].elevationM;

  for (let i = 1; i < smoothed.length; i++) {
    const elevation = smoothed[i].elevationM;
    minElevationM = Math.min(minElevationM, elevation);
    maxElevationM = Math.max(maxElevationM, elevation);

    const delta = elevation - smoothed[i - 1].elevationM;
    if (Math.abs(delta) < MIN_ELEVATION_DELTA_M) continue;
    if (delta > 0) totalAscentM += delta;
    else totalDescentM += Math.abs(delta);
  }

  if (maxElevationM - minElevationM < 1) return null;

  return {
    totalAscentM,
    totalDescentM,
    minElevationM,
    maxElevationM,
    profile: smoothed,
  };
}
