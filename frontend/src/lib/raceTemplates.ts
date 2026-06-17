/**
 * 레이스 생성 빠른 시작 템플릿 — 생성 폼을 미리 채워 생성 장벽을 낮춘다.
 * 순수 프리셋(목표 거리 + 기간)이라 백엔드/저장 구조는 필요 없다.
 * 라벨(이름)은 i18n에서 `tpl_<key>` 키로 가져온다.
 */
export type RaceTemplateKey = "weekend10" | "week30" | "commute" | "diet2w";

export type RaceTemplate = {
  key: RaceTemplateKey;
  emoji: string;
  /** 목표 거리(canonical km) */
  goalKm: number;
  /** 기간(일) — 시작=지금, 종료=시작+durationDays */
  durationDays: number;
};

export const RACE_TEMPLATES: RaceTemplate[] = [
  { key: "weekend10", emoji: "🏖️", goalKm: 10, durationDays: 2 },
  { key: "week30", emoji: "🔥", goalKm: 30, durationDays: 7 },
  { key: "commute", emoji: "🌆", goalKm: 20, durationDays: 5 },
  { key: "diet2w", emoji: "💪", goalKm: 40, durationDays: 14 },
];
