/**
 * NSM(Norwegian Singles Method) 계산 유틸 — 프로토타입.
 *
 * 앵커: Jack Daniels VDOT(공개 모델)로 역치(threshold) 페이스를 구하고,
 * 거기서 ±오프셋으로 sub-T 세션 페이스를 만든다. 심박 없이 페이스 기반(MVP).
 *
 * ⚠️ threshold 비율(THRESHOLD_VO2_FRACTION)과 오프셋은 튜닝 대상이다.
 *    최종 출력은 Daniels 계산기 / 런갤 "딸깍 표"와 ±2~3초/km 안에서 맞춰 검증해야 한다.
 */

import { formatPaceSecPerUnit } from "@/lib/units";

/** 역치 강도로 쓰는 VO2max 비율(≈LT2). Daniels T 페이스 근사. 검증 후 보정. */
const THRESHOLD_VO2_FRACTION = 0.88;
/** 짧은 렙은 역치보다 빠르게, 긴 렙은 느리게 (5~7초/km). */
const SHORT_OFFSET_SEC = -6;
const LONG_OFFSET_SEC = 6;

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

/** sub-T 세션 3종 — 역치 페이스 기준 오프셋 적용. */
function shortSession(day: number, t: number): NsmSession {
  return { day, kind: "SHORT", isSubT: true, reps: 10, repAmount: 1, repUnit: "km", restSec: 60, targetPaceSec: t + SHORT_OFFSET_SEC };
}
function mediumSession(day: number, t: number): NsmSession {
  return { day, kind: "MEDIUM", isSubT: true, reps: 5, repAmount: 6, repUnit: "min", restSec: 60, targetPaceSec: t };
}
function longSession(day: number, t: number): NsmSession {
  return { day, kind: "LONG", isSubT: true, reps: 3, repAmount: 3, repUnit: "km", restSec: 120, targetPaceSec: t + LONG_OFFSET_SEC };
}
function easy(day: number): NsmSession {
  return { day, kind: "EASY", isSubT: false };
}
function longRun(day: number): NsmSession {
  return { day, kind: "LONGRUN", isSubT: false };
}

/**
 * 한 주 NSM 스케줄 생성(월=0 … 일=6). 이지런 날까지 모두 포함한다.
 * subTDays: 사용자가 고른 sub-T 요일(2~3개). 이른 요일부터 SHORT→MEDIUM→LONG 배정.
 * 롱런은 가장 늦은(일요일 우선) 이지런 날에 1회, 나머지는 이지런.
 * 특정 요일에 강제되지 않고 사용자가 자기 일정에 맞게 고른다.
 */
export function weeklyPlan(thresholdSec: number, subTDays: number[]): NsmSession[] {
  const t = thresholdSec;
  const days = Array.from(new Set(subTDays))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .slice(0, 3); // 계약은 sub-T 2~3개 — 방어적으로 최대 3개 캡(롱런 자리·이지런 보장)

  const makers = [shortSession, mediumSession, longSession];
  const result: NsmSession[] = Array.from({ length: 7 }, (_, d) => easy(d));

  // days는 위에서 slice(0,3)으로 최대 3개라 makers[i]는 항상 유효(i<3). SHORT→MEDIUM→LONG.
  days.forEach((d, i) => {
    result[d] = makers[i](d, t);
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
