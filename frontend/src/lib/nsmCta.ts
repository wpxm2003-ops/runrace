import { localJson } from "./safeStorage";
import type { GhostRaceResult } from "./ghostRace";

/**
 * 고스트 패배 → NSM 훈련 제안 CTA 게이트.
 *
 * 패배 "이벤트"마다 반응하지 않고 3중 게이트를 모두 통과할 때만 연다(벽지화 방지):
 * 1. 상태 — 활성 NSM 플랜이 없는 유저만 (플랜을 시작하면 CTA는 사라진다)
 * 2. 순간 — 접전 패배 또는 같은 유령에게 연패 (대패·설렁런은 제외)
 * 3. 빈도 — 유저 단위 7일 1회 캡. 캡을 표면(고스트/추후 라이벌)마다가 아니라
 *    여기 한곳에서 관리해, 노출 표면이 늘어도 총량은 늘지 않는다.
 */

/** 접전 = 유령 시간의 5% 이내 패배. 짧은 런에서 판이 사실상 안 열리는 걸 막는 15초 바닥. */
const CLOSE_LOSS_FRACTION = 0.05;
const CLOSE_LOSS_FLOOR_MS = 15_000;
/** 같은 유령에게 이만큼 연달아 지면 접전이 아니어도 "이 기록에 막혔다"로 본다. */
export const LOSS_STREAK_THRESHOLD = 2;
const SHOW_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const shownStore = localJson<{ lastShownAt: number }>("runrace_nsm_cta_shown");
const streakStore = localJson<Record<string, number>>("runrace_ghost_loss_streaks");

/** 패배 판정 — 결과 카드와 같은 반올림 기준(반올림 0초는 무승부). */
export function isGhostLoss(result: GhostRaceResult): boolean {
  return Math.round(result.deltaMs / 1000) > 0;
}

export function isCloseLoss(result: GhostRaceResult): boolean {
  if (!isGhostLoss(result)) return false;
  return result.deltaMs <= Math.max(CLOSE_LOSS_FLOOR_MS, result.ghostTimeMs * CLOSE_LOSS_FRACTION);
}

/** 순수 게이트 — 스토리지·시계를 인자로 받는다(테스트 대상은 이쪽). */
export function evaluateNsmCta(opts: {
  hasPlan: boolean;
  result: GhostRaceResult;
  lossStreak: number;
  lastShownAt: number;
  now: number;
}): boolean {
  const { hasPlan, result, lossStreak, lastShownAt, now } = opts;
  if (hasPlan || !isGhostLoss(result)) return false;
  if (!isCloseLoss(result) && lossStreak < LOSS_STREAK_THRESHOLD) return false;
  return now - lastShownAt >= SHOW_COOLDOWN_MS;
}

/**
 * 유령 레이스 결과를 연패 장부에 기록하고, 이 유령에게의 현재 연패 수를 돌려준다.
 * 승리·무승부는 그 유령의 연패를 리셋한다. 유령별 항목이라 A·B를 번갈아 져도 각각 쌓인다.
 */
export function recordGhostLossStreak(ghostWorkoutId: number, lost: boolean): number {
  const streaks = streakStore.get() ?? {};
  const key = String(ghostWorkoutId);
  const next = lost ? (streaks[key] ?? 0) + 1 : 0;
  if (next === 0) delete streaks[key];
  else streaks[key] = next;
  streakStore.set(streaks);
  return next;
}

/** 호출부용 — 마지막 노출 시각을 스토리지에서 읽어 게이트를 평가한다. */
export function shouldShowNsmCta(opts: {
  hasPlan: boolean;
  result: GhostRaceResult;
  lossStreak: number;
}): boolean {
  return evaluateNsmCta({
    ...opts,
    lastShownAt: shownStore.get()?.lastShownAt ?? 0,
    now: Date.now(),
  });
}

/** CTA가 실제로 화면에 뜬 순간 호출 — 7일 캡 시계 시작(저장 실패 등으로 안 떴으면 캡 미소비). */
export function markNsmCtaShown(): void {
  shownStore.set({ lastShownAt: Date.now() });
}
