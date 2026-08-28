import {
  creditedSegmentMeters,
  haversineMeters,
  isPathBreak,
  type LatLng,
} from "./workoutTrack";

export type KmSplit = {
  km: number;
  distanceM: number;
  paceSec: number;
  paceChange: number | null;
};

/** t가 있는 경로에서 km 구간별 페이스를 계산한다. */
export function computeKmSplits(path: LatLng[]): KmSplit[] {
  const pts = path.filter((p) => p.t != null);
  if (pts.length < 2) return [];
  const splits: KmSplit[] = [];
  let kmIndex = 1;
  let kmStartM = 0;
  let tStart = pts[0].t!;
  let cumM = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = creditedSegmentMeters(pts[i - 1], pts[i]);
    const tPrev = pts[i - 1].t!;
    const tCurr = pts[i].t!;
    const prevCumM = cumM;
    cumM += seg;
    while (cumM >= kmIndex * 1000) {
      const targetM = kmIndex * 1000;
      const frac = seg > 0 ? (targetM - prevCumM) / seg : 1;
      const tAtKm = tPrev + frac * (tCurr - tPrev);
      const paceSec = (tAtKm - tStart) / 1000;
      const prev = splits[splits.length - 1] ?? null;
      splits.push({ km: kmIndex, distanceM: 1000, paceSec, paceChange: prev ? paceSec - prev.paceSec : null });
      kmStartM = targetM;
      tStart = tAtKm;
      kmIndex++;
    }
  }
  const lastM = cumM - kmStartM;
  if (lastM >= 100 && splits.length > 0) {
    const paceSec = ((pts[pts.length - 1].t! - tStart) / 1000) / (lastM / 1000);
    const prev = splits[splits.length - 1];
    splits.push({ km: kmIndex, distanceM: Math.round(lastM), paceSec, paceChange: paceSec - prev.paceSec });
  }
  return splits;
}

const PB_TARGETS = [
  { key: "3k", m: 3_000 }, { key: "5k", m: 5_000 }, { key: "10k", m: 10_000 },
  { key: "half", m: 21_097 }, { key: "marathon", m: 42_195 },
] as const;

/** 끊김 없는 GPS 구간에서 PB 목표 거리의 최고 페이스를 찾는다. */
export function computeBestSegments(path: LatLng[]): Record<string, number> {
  const pts = path.filter((p) => p.t != null);
  if (pts.length < 2) return {};
  const subpaths: LatLng[][] = [];
  let run: LatLng[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (isPathBreak(pts[i - 1], pts[i])) {
      if (run.length >= 2) subpaths.push(run);
      run = [pts[i]];
    } else run.push(pts[i]);
  }
  if (run.length >= 2) subpaths.push(run);
  const best: Record<string, number> = {};
  for (const sub of subpaths) {
    const cumulative = [0];
    for (let i = 1; i < sub.length; i++) cumulative.push(cumulative[i - 1] + haversineMeters(sub[i - 1], sub[i]));
    for (const { key, m: targetM } of PB_TARGETS) {
      if (cumulative[cumulative.length - 1] < targetM) continue;
      let bestPace = best[key] ?? Infinity;
      let end = 1;
      for (let start = 0; start < sub.length - 1; start++) {
        if (end <= start) end = start + 1;
        while (end < sub.length && cumulative[end] - cumulative[start] < targetM) end++;
        if (end >= sub.length) break;
        const before = cumulative[end - 1] - cumulative[start];
        const segment = cumulative[end] - cumulative[end - 1];
        const fraction = segment > 0 ? (targetM - before) / segment : 1;
        const tAtTarget = sub[end - 1].t! + fraction * (sub[end].t! - sub[end - 1].t!);
        const elapsedSec = (tAtTarget - sub[start].t!) / 1000;
        if (elapsedSec > 0) bestPace = Math.min(bestPace, elapsedSec / (targetM / 1000));
      }
      if (bestPace !== Infinity) best[key] = bestPace;
    }
  }
  return Object.fromEntries(Object.entries(best).map(([key, pace]) => [key, Math.round(pace)]));
}
