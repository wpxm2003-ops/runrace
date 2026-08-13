import type { Achievement } from "./api/types";
import type { Translations } from "./i18n/translations";
import { formatDistance, type DistanceUnit } from "./units";

/** 성과 카드의 시각 강도 — 강한 성과일수록 눈에 띄게. */
export type AchievementTone = "gold" | "crew" | "plain";

export type AchievementView = {
  icon: string;
  text: string;
  tone: AchievementTone;
};

/**
 * 서버가 판정한 성과 코드를 화면 문구로 변환한다(문구·단위는 전부 클라이언트 책임).
 * 알 수 없는 코드는 null — 서버가 새 코드를 먼저 배포해도 화면이 깨지지 않는다.
 */
export function achievementView(
  a: Achievement,
  t: Translations,
  unit: DistanceUnit,
): AchievementView | null {
  const n = a.value ?? 0;
  const dist = () => formatDistance(n, unit);

  switch (a.code) {
    case "FIRST_RUN":
      return { icon: "🎉", text: t.ach_first_run, tone: "gold" };
    case "ALL_TIME_DISTANCE":
      return { icon: "🏆", text: t.ach_all_time_distance(dist()), tone: "gold" };
    case "YEAR_DISTANCE":
      return { icon: "🥇", text: t.ach_year_distance(dist()), tone: "gold" };
    case "MONTH30_DISTANCE":
      return { icon: "📈", text: t.ach_month30_distance(dist()), tone: "plain" };
    case "WEEK_DISTANCE":
      return { icon: "📈", text: t.ach_week_distance(dist()), tone: "plain" };
    case "STREAK":
      return { icon: "🔥", text: t.ach_streak(n), tone: "gold" };
    case "TOTAL_DISTANCE":
      // value는 마일스톤 km — 사용자 단위로 표시하기 위해 m로 환산한다.
      return { icon: "🎯", text: t.ach_total_distance(formatDistance(n * 1000, unit)), tone: "gold" };
    case "TOTAL_RUNS":
      return { icon: "👟", text: t.ach_total_runs(n), tone: "plain" };
    case "CREW_GOAL_REACHED":
      return { icon: "👥", text: t.ach_crew_goal_reached, tone: "crew" };
    case "CREW_GOAL_PROGRESS":
      return { icon: "👥", text: t.ach_crew_goal_progress(n), tone: "crew" };
    case "CREW_RANK":
      return { icon: "👥", text: t.ach_crew_rank(n, a.value2 ?? 0), tone: "crew" };
    default:
      return null;
  }
}
