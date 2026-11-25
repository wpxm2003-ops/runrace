import type { Achievement } from "./api/types";
import type { NotificationPermissionState } from "./pushPermission";
import { localJson } from "./safeStorage";

/**
 * 알림 사전 설명 시트 정책.
 * 첫 실행 때 OS 권한 팝업을 바로 띄우지 않고, 알림이 의미 있는 순간(레이스 참가·생성,
 * 첫 운동 저장) 중 먼저 오는 때에 짧은 설명을 보여 준 뒤 사용자가 고르면 OS 권한을 요청한다.
 */
export type PushPromptTrigger = "race_joined" | "race_created" | "first_workout";

/** "나중에"를 누르면 이 기간 동안 다시 묻지 않는다. */
export const PUSH_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export type PushPromptRecord = {
  /** "나중에"·바깥 탭으로 닫음 — 이 시각(epoch ms) 전에는 다시 띄우지 않는다. */
  snoozedUntil?: number;
  /** OS 권한 팝업까지 가서 답을 받았다 — 결과와 무관하게 다시 자동으로 띄우지 않는다. */
  answered?: boolean;
};

const STORAGE_KEY = "runrace_push_prompt";
const store = localJson<PushPromptRecord>(STORAGE_KEY);

/**
 * 시트를 띄울지 판정한다(순수 함수).
 * OS가 물어볼 수 있는 상태(prompt)일 때만 띄운다 — 이미 허용(granted)했거나 OS가 더 이상
 * 묻지 않는(denied) 상태, 웹(unsupported)에서는 띄우지 않는다.
 */
export function canShowPushPrompt(
  permission: NotificationPermissionState,
  record: PushPromptRecord | null,
  now: number,
): boolean {
  if (permission !== "prompt") return false;
  if (record?.answered) return false;
  if (typeof record?.snoozedUntil === "number" && now < record.snoozedUntil) return false;
  return true;
}

export function loadPushPromptRecord(): PushPromptRecord | null {
  const record = store.get();
  return record && typeof record === "object" ? record : null;
}

export function snoozePushPrompt(now: number): void {
  store.set({ ...loadPushPromptRecord(), snoozedUntil: now + PUSH_PROMPT_SNOOZE_MS });
}

/** OS 권한 팝업에 답했다(사전 설명 "알림 받기" 또는 설정 토글에서). */
export function markPushPromptAnswered(): void {
  store.set({ ...loadPushPromptRecord(), answered: true });
}

function normalizePath(pathname: string): string {
  const withoutHtml = pathname.replace(/\.html$/, "");
  const trimmed = withoutHtml.replace(/\/+$/, "");
  return trimmed || "/";
}

/** 운동 기록 화면(/workout, /workout/indoor) 여부. 운동 상세(/workouts/…)는 아니다. */
export function isWorkoutRecordingPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  return p === "/workout" || p.startsWith("/workout/");
}

/**
 * 지금 화면에서 시트를 띄워도 되는지.
 * 첫 운동 저장은 저장 직후 축하 모달이 뜨므로, 기록 화면을 벗어난(상세로 이동한) 뒤에 띄운다.
 */
export function isPushPromptReady(trigger: PushPromptTrigger, pathname: string): boolean {
  if (trigger === "first_workout") return !isWorkoutRecordingPath(pathname);
  return true;
}

/** 서버가 첫 운동 저장에만 FIRST_RUN 성과를 붙인다(AchievementService). */
export function isFirstWorkoutSave(achievements: readonly Achievement[] | null | undefined): boolean {
  return !!achievements?.some((a) => a.code === "FIRST_RUN");
}

// ── 트리거 연결 ─────────────────────────────────────────────────────
// 화면은 순간만 알리고, 띄울지·언제 띄울지는 전역 시트(PushPermissionPrompt)가 정한다.
// 레이스 생성처럼 곧바로 다른 화면으로 이동하는 경우에도 시트가 살아 있도록 전역에서 받는다.

const triggerListeners = new Set<(trigger: PushPromptTrigger) => void>();

export function triggerPushPrompt(trigger: PushPromptTrigger): void {
  for (const listener of [...triggerListeners]) {
    try {
      listener(trigger);
    } catch {
      // 시트 쪽 오류가 레이스 참가·운동 저장 흐름을 막지 않게 한다.
    }
  }
}

export function onPushPromptTrigger(listener: (trigger: PushPromptTrigger) => void): () => void {
  triggerListeners.add(listener);
  return () => {
    triggerListeners.delete(listener);
  };
}
