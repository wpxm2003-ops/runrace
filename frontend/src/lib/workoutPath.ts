import type { LatLng } from "./workoutSessionModels";

const MIN_MOVE_METERS = 4;
const EARTH_RADIUS_M = 6_371_000;
const KOREA_MAINLAND = { minLat: 33, maxLat: 38.75, minLng: 124.5, maxLng: 129.7 };
const KOREA_ULLEUNG_DOKDO = { minLat: 36.9, maxLat: 37.7, minLng: 130.6, maxLng: 132.0 };
const JAPAN_NORTHWEST_ISLANDS = { minLat: 33.0, maxLat: 34.85, minLng: 128.8, maxLng: 129.7 };

function inBox(point: LatLng, box: { minLat: number; maxLat: number; minLng: number; maxLng: number }) {
  return point.lat >= box.minLat && point.lat <= box.maxLat
    && point.lng >= box.minLng && point.lng <= box.maxLng;
}

export function isInKorea(point: LatLng): boolean {
  return !inBox(point, JAPAN_NORTHWEST_ISLANDS)
    && (inBox(point, KOREA_MAINLAND) || inBox(point, KOREA_ULLEUNG_DOKDO));
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export const MAP_GAP_THRESHOLD_M = 120;

export function isPathBreak(previous: LatLng, current: LatLng, threshold = MAP_GAP_THRESHOLD_M) {
  return current.breakBefore === true || haversineMeters(previous, current) > threshold;
}

export function creditedSegmentMeters(previous: LatLng, current: LatLng, threshold = MAP_GAP_THRESHOLD_M) {
  return isPathBreak(previous, current, threshold) ? 0 : haversineMeters(previous, current);
}

export function pathDistanceMeters(points: LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversineMeters(points[i - 1], points[i]);
  return sum;
}

export function creditedPathDistanceMeters(points: LatLng[], threshold = MAP_GAP_THRESHOLD_M): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += creditedSegmentMeters(points[i - 1], points[i], threshold);
  return sum;
}

export type PathSegments = { solidLines: LatLng[][]; gapLines: LatLng[][] };

export function splitPathAtGaps(path: LatLng[], threshold = MAP_GAP_THRESHOLD_M): PathSegments {
  const solidLines: LatLng[][] = [];
  const gapLines: LatLng[][] = [];
  let run: LatLng[] = [];
  for (let i = 0; i < path.length; i++) {
    if (i === 0) { run = [path[0]]; continue; }
    if (isPathBreak(path[i - 1], path[i], threshold)) {
      if (run.length >= 2) solidLines.push(run);
      gapLines.push([path[i - 1], path[i]]);
      run = [path[i]];
    } else run.push(path[i]);
  }
  if (run.length >= 2) solidLines.push(run);
  return { solidLines, gapLines };
}

export function pathBoundsKey(path: LatLng[]): string {
  if (path.length === 0) return "";
  const first = path[0];
  const last = path[path.length - 1];
  return `${path.length}:${first.lat},${first.lng}:${last.lat},${last.lng}`;
}

export function shouldAppendPoint(previous: LatLng | null, next: LatLng): boolean {
  return previous == null || haversineMeters(previous, next) >= MIN_MOVE_METERS;
}
