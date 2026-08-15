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
