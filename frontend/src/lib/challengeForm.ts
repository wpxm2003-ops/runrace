import {
  containsForbiddenText,
  stripForbiddenText,
} from "@/lib/forbiddenTextChars";

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return formatLocalDate(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatLocalDate(dt);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** datetime-local 입력값 (yyyy-MM-ddTHH:mm) */
export function formatLocalDateTime(d: Date): string {
  return `${formatLocalDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
};

/** @deprecated ChallengeFormValues 사용 */
export type CreateChallengeForm = ChallengeFormValues;

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

export type ClampNumericResult = {
  value: string;
  clamped: boolean;
};

/** 목표 km: 숫자만, DB Integer 상한 */
export function clampGoalKm(value: string): ClampNumericResult {
  const rawDigits = sanitizeDigits(value);
  const digits = rawDigits.slice(0, 4);
  if (!digits) return { value: "", clamped: rawDigits.length > 0 };
  let n = parseInt(digits, 10);
  let clamped = rawDigits.length > digits.length;
  if (n > MAX_GOAL_KM) {
    n = MAX_GOAL_KM;
    clamped = true;
  }
  return { value: String(n), clamped };
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
};

/** @deprecated ChallengeFormValidationMessages 사용 */
export type CreateChallengeValidationMessages = ChallengeFormValidationMessages;

export type ValidateChallengeFormOptions = {
  /** 수정 시 현재 참여 인원(인원수 하한) */
  minMembers?: number;
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
  const goal = parseInt(form.goalKm, 10);
  if (!Number.isFinite(goal) || goal < 1 || goal > MAX_GOAL_KM) {
    return msgs.goalRange;
  }

  if (!form.maxMembers.trim()) return msgs.membersRequired;
  const max = parseInt(form.maxMembers, 10);
  if (!Number.isFinite(max) || max < minMembers || max > MAX_MEMBERS) {
    return msgs.membersRange;
  }

  if (!form.startAt) return msgs.startRequired;
  if (!form.endAt) return msgs.endRequired;

  const startMs = new Date(form.startAt).getTime();
  const endMs = new Date(form.endAt).getTime();
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

  return null;
}

/** @deprecated validateChallengeForm 사용 */
export function validateCreateChallengeForm(
  form: ChallengeFormValues,
  msgs: ChallengeFormValidationMessages,
): string | null {
  return validateChallengeForm(form, msgs);
}

export type ChallengeFormPayload = {
  title: string;
  goalKm: number;
  maxMembers: number;
  startAt: string;
  endAt: string;
};

export function toChallengeFormPayload(form: ChallengeFormValues): ChallengeFormPayload {
  return {
    title: form.title.trim(),
    goalKm: parseInt(form.goalKm, 10),
    maxMembers: parseInt(form.maxMembers, 10),
    startAt: localDatetimeToIso(form.startAt),
    endAt: localDatetimeToIso(form.endAt),
  };
}
