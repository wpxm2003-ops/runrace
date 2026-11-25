import type { User } from "firebase/auth";
import { apiFetch } from "./client";

export type AdminMember = {
  displayName: string | null;
  nickname: string | null;
  provider: string | null;
  pushEnabled: boolean;
  /** UI·푸시 문구 언어(users.lang_cd). */
  langCd: string | null;
  /** 기기에서 수집한 IANA 타임존 — 해외 사용자 분포 파악용. */
  timeZone: string | null;
  createdAt: string;
};

export type AdminWorkout = {
  id: number;
  displayName: string | null;
  distanceM: number;
  durationSec: number;
  startedAt: string;
  endedAt: string;
  createdAt: string;
  hasImage: boolean;
  hasMemo: boolean;
};

export type AdminFeedback = {
  id: number;
  userDisplayName: string | null;
  type: "IDEA" | "INCONVENIENCE" | "BUG" | "ETC";
  title: string;
  content: string;
  imageUrls: string[];
  status: "OPEN" | "CHECKING" | "DONE" | "CLOSED";
  pageUrl: string | null;
  userAgent: string | null;
  appVersion: string | null;
  createdAt: string;
};

export type AdminActivity = {
  id: number;
  displayName: string | null;
  actionType: string;
  targetType: string;
  occurredAt: string;
};

export type AdminDashboard = {
  members: AdminMember[];
  workouts: AdminWorkout[];
  activities: AdminActivity[];
  feedback: AdminFeedback[];
};

export function getAdminDashboard(user: User) {
  return apiFetch<AdminDashboard>("/api/admin/dashboard", {
    user,
    redirectOn401: false,
  });
}

/** D-n 한 칸 — 판정 가능한 가입자(분모)와 그 날 활동한 가입자(분자). */
export type AdminRetentionCell = { eligible: number; retained: number };

export type AdminRetentionRates = {
  d1: AdminRetentionCell;
  d7: AdminRetentionCell;
  d30: AdminRetentionCell;
};

export type AdminActiveUsers = {
  /** 오늘(진행 중) 활동한 사용자 수. */
  dau: number;
  /** 어제까지 최근 7일 일평균. 판정할 날이 없으면 null. */
  avgDau7d: number | null;
  /** 평균에 쓴 날 수(방문 기준은 수집 첫날 제외라 7보다 작을 수 있다). */
  avgDauDays: number;
  /** 오늘 포함 최근 7일 활동 사용자 수. */
  wau: number;
  /** 오늘 포함 최근 30일 활동 사용자 수. */
  mau: number;
};

export type AdminRetentionCohort = {
  /** 가입 주 월요일(yyyy-MM-dd). */
  weekStart: string;
  weekEnd: string;
  size: number;
  visits: AdminRetentionRates;
  runs: AdminRetentionRates;
};

/** GET /api/admin/retention — 방문 기준(visits)과 달리기 기준(runs)을 나란히 낸다. */
export type AdminRetention = {
  /** 기준일(KST 오늘, yyyy-MM-dd). */
  referenceDate: string;
  referenceTimeZone: string;
  /** 첫 방문 핑을 받은 날(KST, 보통 배포일). 아직 없으면 null. 판정은 그 다음 날부터. */
  visitCollectionStartDate: string | null;
  newSignups7d: number;
  visits: AdminActiveUsers;
  runs: AdminActiveUsers;
  /** 최근 가입 주부터 8주. */
  cohorts: AdminRetentionCohort[];
};

export function getAdminRetention(user: User) {
  return apiFetch<AdminRetention>("/api/admin/retention", {
    user,
    redirectOn401: false,
  });
}
