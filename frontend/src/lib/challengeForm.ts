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

export type CreateChallengeForm = {
  title: string;
  goalKm: string;
  maxMembers: string;
  startDate: string;
  endDate: string;
};

export const MAX_MEMBERS = 50;

/** 숫자 외 문자를 제거한다(목표 km 등 정수 입력용). */
export function sanitizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** 인원수 입력: 숫자만 남기고 최대 {@link MAX_MEMBERS}명으로 제한. 빈 값은 그대로 둔다. */
export function clampMaxMembers(value: string): string {
  const digits = sanitizeDigits(value);
  if (!digits) return "";
  return String(Math.min(MAX_MEMBERS, parseInt(digits, 10)));
}

export function validateCreateChallengeForm(form: CreateChallengeForm): string | null {
  const title = form.title.trim();
  if (!title) return "제목을 입력하세요.";

  if (!form.goalKm.trim()) return "목표 km를 입력하세요.";
  const goal = parseInt(form.goalKm, 10);
  if (!Number.isFinite(goal) || goal < 1) {
    return "목표 km는 1 이상 정수로 입력하세요.";
  }

  if (!form.maxMembers.trim()) return "인원수를 입력하세요.";
  const max = parseInt(form.maxMembers, 10);
  if (!Number.isFinite(max) || max < 1 || max > 50) {
    return "인원수는 1~50명입니다.";
  }

  if (!form.startDate) return "시작일을 선택하세요.";
  if (!form.endDate) return "종료일을 선택하세요.";

  const today = todayStr();
  if (form.startDate < today) {
    return "시작일은 오늘 이후만 선택할 수 있습니다.";
  }
  if (form.endDate <= form.startDate) {
    return "종료일은 시작일보다 이후여야 합니다.";
  }

  return null;
}
