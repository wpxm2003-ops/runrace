import type { User } from "firebase/auth";
import { apiFetch } from "./client";

export type AdminMember = {
  displayName: string | null;
  nickname: string | null;
  provider: string | null;
  pushEnabled: boolean;
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

export type AdminDashboard = {
  members: AdminMember[];
  workouts: AdminWorkout[];
  feedback: AdminFeedback[];
};

export function getAdminDashboard(user: User) {
  return apiFetch<AdminDashboard>("/api/admin/dashboard", {
    user,
    redirectOn401: false,
  });
}
