import {
  containsForbiddenText,
  stripForbiddenText,
} from "@/lib/forbiddenTextChars";
import { goalKmFromInput, goalMaxInUnit, type DistanceUnit } from "@/lib/units";
import { toDateTimeLocal } from "@/lib/format";

/** datetime-local 입력값 (yyyy-MM-ddTHH:mm) */
export function formatLocalDateTime(d: Date): string {
  return toDateTimeLocal(d);
}

/** datetime-local min: 현재 시각(초 단위 절삭) */
export function minStartAtLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return formatLocalDateTime(d);
}

/** datetime-local → ISO (API 전송용) */
export function localDatetimeToIso(local: string): string {
  return new Date(local).toISOString();
}

/** datetime-local 문자열에 일수를 더한다(음수 가능). 입력칸 min/max 계산용. */
export function plusDaysLocal(local: string, days: number): string {
  const d = new Date(local);
  d.setDate(d.getDate() + days);
  return formatLocalDateTime(d);
}

export function defaultEndAtAfterStart(startAtLocal: string): string {
  const d = new Date(startAtLocal);
  d.setHours(d.getHours() + 1);
  return formatLocalDateTime(d);
}

export type ChallengeFormValues = {
  title: string;
  goalKm: string;
  maxMembers: string;
  startAt: string;
  endAt: string;
  /** 내기(페널티/보상) 텍스트 — 선택값(빈 문자열 가능). */
  stake: string;
};

/** 레이스 제목 최대 길이 (UTF-8 바이트) */
export const TITLE_MAX_BYTES = 50;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** UTF-8 바이트 기준으로 문자열을 잘라 낸다. */
export function truncateToUtf8Bytes(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let used = 0;
  let out = "";
  for (const char of value) {
    const n = encoder.encode(char).length;
    if (used + n > maxBytes) break;
    used += n;
    out += char;
  }
  return out;
}
/** DB `challenge.max_members` 상한 (백엔드 validateRoomInput) */
export const MAX_MEMBERS = 50;
/** 목표 km 상한 */
export const MAX_GOAL_KM = 1000;

export function isTitleAllowed(title: string): boolean {
  const t = title.trim();
  return t.length > 0 && !containsForbiddenText(t);
}

export type SanitizeTitleResult = {
  value: string;
  removedSpecial: boolean;
  truncated: boolean;
};

/** 제목: 금지 문자 제거 + UTF-8 최대 바이트 */
export function sanitizeTitle(value: string): SanitizeTitleResult {
  const withoutSpecial = stripForbiddenText(value);
  const removedSpecial = withoutSpecial.length !== value.length;
  const valueOut = truncateToUtf8Bytes(withoutSpecial, TITLE_MAX_BYTES);
  const truncated = utf8ByteLength(valueOut) < utf8ByteLength(withoutSpecial);
  return { value: valueOut, removedSpecial, truncated };
}

/** 숫자 외 문자를 제거한다(목표 km 등 정수 입력용). */
export function sanitizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** 내기 텍스트 최대 길이(문자) — 백엔드 STAKE_MAX_CHARS와 일치. */
export const STAKE_MAX_CHARS = 30;

/** 내기 텍스트: 금지 문자 제거 + 최대 길이 컷(선택값이라 빈 값 허용). */
export type SanitizeStakeResult = {
  value: string;
  removedSpecial: boolean;
  truncated: boolean;
};

export function sanitizeStake(value: string): SanitizeStakeResult {
  const withoutSpecial = stripForbiddenText(value);
  const removedSpecial = withoutSpecial.length !== value.length;
  const valueOut = withoutSpecial.slice(0, STAKE_MAX_CHARS);
  const truncated = valueOut.length < withoutSpecial.length;
  return { value: valueOut, removedSpecial, truncated };
}

export function isStakeAllowed(stake: string): boolean {
  const s = stake.trim();
  if (!s) return true;
  return !containsForbiddenText(s);
}

export type ClampNumericResult = {
  value: string;
  clamped: boolean;
};

/** 목표 거리: 숫자+소수점, 선택 단위 기준 상한(=GOAL_MAX_KM km) 클램프. */
export function clampGoalKm(value: string, unit: DistanceUnit): ClampNumericResult {
  let cleaned = value.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot !== -1) {
    // 소수점은 하나만 — 이후의 점은 제거
    cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
  }
  if (cleaned === "" || cleaned === ".") return { value: cleaned, clamped: false };
  const n = parseFloat(cleaned);
  const max = goalMaxInUnit(unit);
  if (Number.isFinite(n) && n > max) {
    return { value: String(max), clamped: true };
  }
  return { value: cleaned, clamped: false };
}

/** 경품 최대 등수 = min(정원, 10). 정원 입력이 비거나 잘못되면 10으로 폴백. */
export function prizeMaxRank(maxMembers: string): number {
  return Math.max(1, Math.min(parseInt(maxMembers || "0", 10) || 10, 10));
}

/** 인원수: 숫자만, 최대 {@link MAX_MEMBERS}명 */
export function clampMaxMembers(value: string): ClampNumericResult {
  const digits = sanitizeDigits(value);
  if (!digits) return { value: "", clamped: false };
  const n = parseInt(digits, 10);
  if (n > MAX_MEMBERS) {
    return { value: String(MAX_MEMBERS), clamped: true };
  }
  return { value: String(n), clamped: false };
}

export type ChallengeFormValidationMessages = {
  titleRequired: string;
  titleSpecial: string;
  titleMax: string;
  goalRequired: string;
  goalRange: string;
  membersRequired: string;
  membersRange: string;
  startRequired: string;
  endRequired: string;
  startTooSoon: string;
  endAfterStart: string;
  durationTooLong: string;
  stakeSpecial: string;
  stakeTooLong: string;
};

/** 레이스 최대 기간(일) — 백엔드 RaceRules.MAX_DURATION_DAYS와 일치. */
export const MAX_RACE_DURATION_DAYS = 31;
const MAX_RACE_DURATION_MS = MAX_RACE_DURATION_DAYS * 24 * 60 * 60 * 1000;

export type DateWindowMessages = {
  startRequired: string;
  endRequired: string;
  startTooSoon: string;
  endAfterStart: string;
  durationTooLong: string;
};

/**
 * 시작/종료일시(datetime-local 문자열) 검증 — 레이스 등록·크루 대항전이 공유한다.
 * 과거 시작 금지(분 단위 절삭 비교), 종료는 시작 이후, 최대 기간 이내(백엔드 RaceRules와 동일 규칙).
 */
export function validateDateWindow(
  startAt: string,
  endAt: string,
  msgs: DateWindowMessages,
): string | null {
  if (!startAt) return msgs.startRequired;
  if (!endAt) return msgs.endRequired;

  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  const nowFloor = new Date();
  nowFloor.setSeconds(0, 0);
  nowFloor.setMilliseconds(0);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return msgs.startRequired;
  }
  if (startMs < nowFloor.getTime()) {
    return msgs.startTooSoon;
  }
  if (endMs <= startMs) {
    return msgs.endAfterStart;
  }
  if (endMs - startMs > MAX_RACE_DURATION_MS) {
    return msgs.durationTooLong;
  }
  return null;
}

export type ValidateChallengeFormOptions = {
  /** 수정 시 현재 참여 인원(인원수 하한) */
  minMembers?: number;
  /** 목표 입력 단위(목표를 km로 환산해 범위 검증) */
  unit?: DistanceUnit;
};

export function validateChallengeForm(
  form: ChallengeFormValues,
  msgs: ChallengeFormValidationMessages,
  options?: ValidateChallengeFormOptions,
): string | null {
  const minMembers = options?.minMembers ?? 1;
  const title = form.title.trim();
  if (!title) return msgs.titleRequired;
  if (!isTitleAllowed(title)) return msgs.titleSpecial;
  if (utf8ByteLength(title) > TITLE_MAX_BYTES) return msgs.titleMax;

  if (!form.goalKm.trim()) return msgs.goalRequired;
  const goalKm = goalKmFromInput(form.goalKm, options?.unit ?? "km");
  if (!Number.isFinite(goalKm) || goalKm <= 0 || goalKm > MAX_GOAL_KM) {
    return msgs.goalRange;
  }

  if (!form.maxMembers.trim()) return msgs.membersRequired;
  const max = parseInt(form.maxMembers, 10);
  if (!Number.isFinite(max) || max < minMembers || max > MAX_MEMBERS) {
    return msgs.membersRange;
  }

  const dateError = validateDateWindow(form.startAt, form.endAt, msgs);
  if (dateError) return dateError;

  if (form.stake.trim()) {
    const stake = form.stake.trim();
    if (!isStakeAllowed(stake)) return msgs.stakeSpecial;
    if (stake.length > STAKE_MAX_CHARS) return msgs.stakeTooLong;
  }

  return null;
}

export type ChallengeFormPayload = {
  title: string;
  goalKm: number;
  maxMembers: number;
  startAt: string;
  endAt: string;
  stake: string;
};

export function toChallengeFormPayload(
  form: ChallengeFormValues,
  unit: DistanceUnit,
): ChallengeFormPayload {
  return {
    title: form.title.trim(),
    goalKm: goalKmFromInput(form.goalKm, unit),
    maxMembers: parseInt(form.maxMembers, 10),
    startAt: localDatetimeToIso(form.startAt),
    endAt: localDatetimeToIso(form.endAt),
    stake: form.stake.trim(),
  };
}
