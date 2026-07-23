/**
 * NSM(Norwegian Singles Method) 계산 유틸.
 *
 * 앵커: Jack Daniels VDOT(공개 모델)로 역치(threshold) 페이스를 구하고,
 * 거기서 오프셋으로 sub-T 세션 페이스를 만든다. 심박 없이 페이스 기반(MVP).
 *
 * 오프셋·볼륨 밴드별 렙 수는 런갤(러닝 마이너 갤러리) NSM 자료 종합 + 커뮤니티 페이스 표
 * (10K 45:00 → 3분 4:33-4:37 / 6분 4:44-4:50 / 10분 4:50-4:55) 대조로 검증(2026-07).
 */

import { formatPaceSecPerUnit } from "@/lib/units";

/** 역치 강도로 쓰는 VO2max 비율(≈LT2). Daniels T 페이스 근사. */
const THRESHOLD_VO2_FRACTION = 0.88;
/** 짧은 렙(3분)은 역치와 동일, 중간(6분)·긴 렙(10분)은 갈수록 느리게 — 런갤 페이스 표 대조 검증됨. */
const SHORT_OFFSET_SEC = 0;
const MEDIUM_OFFSET_SEC = 8;
const LONG_OFFSET_SEC = 15;

/** 레이스 기록(거리 m, 시간 초) → VDOT (Daniels 공식). */
export function vdotFromRace(distanceM: number, timeSec: number): number {
  const timeMin = timeSec / 60;
  const v = distanceM / timeMin; // 분당 미터
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * timeMin) +
    0.2989558 * Math.exp(-0.1932605 * timeMin);
  return vo2 / pct;
}

/** VO2(분당 미터 속도 v)의 역함수 — VO2 값에 해당하는 속도(m/min)를 구한다. */
function velocityForVo2(vo2: number): number {
  // 0.000104 v^2 + 0.182258 v - 4.6 = vo2  →  근의 공식(양근)
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** VDOT → 역치 페이스(초/km). */
export function thresholdPaceSecPerKm(vdot: number): number {
  const v = velocityForVo2(THRESHOLD_VO2_FRACTION * vdot); // m/min
  return Math.round(60000 / v); // 초/km
}

/** 레이스 기록 → 역치 페이스(초/km) 한 방에. */
export function thresholdFromRace(distanceM: number, timeSec: number): number {
  return thresholdPaceSecPerKm(vdotFromRace(distanceM, timeSec));
}

/** 현실적 역치 페이스 범위(초/km) — 이 밖이면 거리·시간 조합이 사람이 달릴 수 없는 값. */
export const MIN_REALISTIC_THRESHOLD_SEC = 150; // 2'30"/km
export const MAX_REALISTIC_THRESHOLD_SEC = 600; // 10'00"/km

/**
 * 계산된 역치 페이스가 현실 범위인지. 거리(고정 버튼)와 시간(자유 입력)의 조합이
 * 생리학적으로 불가능하면(예: Half + 10분, 5K + 205분) false — 비정상 VDOT·페이스 저장·표시 차단.
 */
export function isRealisticThreshold(thresholdSec: number): boolean {
  return (
    Number.isFinite(thresholdSec) &&
    thresholdSec >= MIN_REALISTIC_THRESHOLD_SEC &&
    thresholdSec <= MAX_REALISTIC_THRESHOLD_SEC
  );
}

export type NsmSessionKind = "EASY" | "LONGRUN" | "SHORT" | "MEDIUM" | "LONG";

export type NsmSession = {
  /** 0=월 … 6=일 */
  day: number;
  kind: NsmSessionKind;
  /** 빡센 가이드 대상(sub-T)인지. EASY/LONGRUN은 false. */
  isSubT: boolean;
  reps?: number;
  repAmount?: number;
  repUnit?: "km" | "min";
  restSec?: number;
  /** sub-T 세션만. 초/km. */
  targetPaceSec?: number;
};

/** 주간 러닝 볼륨 밴드 — 0=<3h, 1=3-4h, 2=4-5h, 3=5-6h, 4=6-8h+. sub-T 렙 수·요일 수·MEDIUM 휴식을 여기에 맞춰 스케일링. */
export type NsmVolumeBand = 0 | 1 | 2 | 3 | 4;

type BandConfig = {
  shortReps: number;
  mediumReps: number;
  longReps: number;
  mediumRestSec: number;
  minSubTDays: number;
  maxSubTDays: number;
  /** 주간 sub-T 총 분(도즈 상한 경고 비교용) — 런갤 볼륨 티어 표 기준. */
  doseMinMin: number;
  doseMaxMin: number;
};

/** 볼륨 밴드별 처방 — 런갤 NSM 볼륨 티어 표 기준(검증 완료, 2026-07). */
export const NSM_BAND_CONFIG: Record<NsmVolumeBand, BandConfig> = {
  0: { shortReps: 6, mediumReps: 3, longReps: 2, mediumRestSec: 90, minSubTDays: 1, maxSubTDays: 1, doseMinMin: 15, doseMaxMin: 25 },
  1: { shortReps: 7, mediumReps: 3, longReps: 2, mediumRestSec: 90, minSubTDays: 1, maxSubTDays: 2, doseMinMin: 25, doseMaxMin: 40 },
  2: { shortReps: 8, mediumReps: 4, longReps: 2, mediumRestSec: 90, minSubTDays: 2, maxSubTDays: 2, doseMinMin: 40, doseMaxMin: 60 },
  3: { shortReps: 9, mediumReps: 4, longReps: 3, mediumRestSec: 90, minSubTDays: 2, maxSubTDays: 3, doseMinMin: 55, doseMaxMin: 75 },
  4: { shortReps: 10, mediumReps: 5, longReps: 3, mediumRestSec: 60, minSubTDays: 2, maxSubTDays: 3, doseMinMin: 70, doseMaxMin: 105 },
};

/** 밴드 미지정(레거시 플랜·미선택) 기본값 — 렙 수는 기존 상수와 동일(하위호환), 휴식만 안전 기본값(90s, Phase 1 수정). */
const DEFAULT_BAND_CONFIG: BandConfig = {
  shortReps: 10, mediumReps: 5, longReps: 3, mediumRestSec: 90,
  minSubTDays: 2, maxSubTDays: 3, doseMinMin: 70, doseMaxMin: 105,
};

function bandConfig(band?: NsmVolumeBand): BandConfig {
  return band != null ? NSM_BAND_CONFIG[band] : DEFAULT_BAND_CONFIG;
}

/** sub-T 요일 수 제약(밴드별). onToggleDay 등 UI에서 사용. */
export function subTDayLimits(band?: NsmVolumeBand): { min: number; max: number } {
  const cfg = bandConfig(band);
  return { min: cfg.minSubTDays, max: cfg.maxSubTDays };
}

/** 선택한 sub-T 요일 배열을 밴드 제약에 맞게 다듬는다 — 초과분 트림, 부족분은 앞 요일부터 채움. */
export function clampSubTDaysToBand(days: number[], band?: NsmVolumeBand): number[] {
  const { min, max } = subTDayLimits(band);
  let result = Array.from(new Set(days)).sort((a, b) => a - b);
  if (result.length > max) result = result.slice(0, max);
  let candidate = 0;
  while (result.length < min && result.length < 7) {
    if (!result.includes(candidate)) result = [...result, candidate].sort((a, b) => a - b);
    candidate++;
  }
  return result;
}

/** sub-T 세션 3종 — 역치 페이스 기준 오프셋 + 밴드별 렙 수/휴식 적용. */
function shortSession(day: number, t: number, cfg: BandConfig): NsmSession {
  return { day, kind: "SHORT", isSubT: true, reps: cfg.shortReps, repAmount: 3, repUnit: "min", restSec: 60, targetPaceSec: t + SHORT_OFFSET_SEC };
}
function mediumSession(day: number, t: number, cfg: BandConfig): NsmSession {
  return { day, kind: "MEDIUM", isSubT: true, reps: cfg.mediumReps, repAmount: 6, repUnit: "min", restSec: cfg.mediumRestSec, targetPaceSec: t + MEDIUM_OFFSET_SEC };
}
function longSession(day: number, t: number, cfg: BandConfig): NsmSession {
  return { day, kind: "LONG", isSubT: true, reps: cfg.longReps, repAmount: 10, repUnit: "min", restSec: 120, targetPaceSec: t + LONG_OFFSET_SEC };
}
function easy(day: number): NsmSession {
  return { day, kind: "EASY", isSubT: false };
}
function longRun(day: number): NsmSession {
  return { day, kind: "LONGRUN", isSubT: false };
}

/**
 * 한 주 NSM 스케줄 생성(월=0 … 일=6). 이지런 날까지 모두 포함한다.
 * subTDays: 사용자가 고른 sub-T 요일(밴드별 min~max개). 이른 요일부터 SHORT→MEDIUM→LONG 배정.
 * band: 주간 러닝 볼륨 밴드. 미지정 시 레거시 기본값(기존 상수 10/5/3 렙, 휴식 90s).
 * 롱런은 가장 늦은(일요일 우선) 이지런 날에 1회, 나머지는 이지런.
 */
export function weeklyPlan(thresholdSec: number, subTDays: number[], band?: NsmVolumeBand): NsmSession[] {
  const t = thresholdSec;
  const cfg = bandConfig(band);
  const days = Array.from(new Set(subTDays))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .slice(0, 3); // 계약은 sub-T 1~3개 — 방어적으로 최대 3개 캡(롱런 자리·이지런 보장)

  const makers = [shortSession, mediumSession, longSession];
  const result: NsmSession[] = Array.from({ length: 7 }, (_, d) => easy(d));

  days.forEach((d, i) => {
    result[d] = makers[i](d, t, cfg);
  });

  // 롱런 — 가장 늦은(일요일 우선) 이지런 날에 배치.
  for (let d = 6; d >= 0; d--) {
    if (result[d].kind === "EASY") {
      result[d] = longRun(d);
      break;
    }
  }
  return result;
}

/** 이번 주 sub-T 총 분(도즈 상한 경고 비교용). 모든 sub-T 세션은 시간 기반(repUnit "min")이라 단순 합산. */
export function weeklySubTMinutes(plan: NsmSession[]): number {
  return plan.reduce((sum, s) => (s.isSubT ? sum + (s.reps ?? 0) * (s.repAmount ?? 0) : sum), 0);
}

/** 밴드 도즈 상한 초과 여부 — 밴드 미지정 시 비교 기준이 없어 항상 false(소프트 경고이므로 밴드 선택 시에만 의미 있음). */
export function isOverBandDose(plan: NsmSession[], band?: NsmVolumeBand): boolean {
  if (band == null) return false;
  return weeklySubTMinutes(plan) > NSM_BAND_CONFIG[band].doseMaxMin;
}

/** 초/km → "m'ss"" 표기. */
export function formatPaceSec(sec: number): string {
  return formatPaceSecPerUnit(sec);
}

/** 오늘의 NSM 주간 인덱스(월=0 … 일=6). weeklyPlan 인덱싱 규약의 단일 출처. */
export function nsmTodayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

/**
 * 선택한 sub-T 요일 중 이틀 연속(붙어있는) 날이 있는지 — NSM은 빡센 세션 사이에 이지런을 권장.
 * 소프트 경고용(비차단). 주 경계(일↔월)는 시각적으로 붙어 보이지 않아 제외한다.
 */
export function hasAdjacentSubTDays(days: number[]): boolean {
  const sorted = Array.from(new Set(days)).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] === 1) return true;
  }
  return false;
}
