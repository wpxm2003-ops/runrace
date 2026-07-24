import type { User } from "firebase/auth";
import { apiFetch } from "./client";

export type AdminMember = {
  displayName: string | null;
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

export type AdminDashboard = {
  members: AdminMember[];
  workouts: AdminWorkout[];
};

export function getAdminDashboard(user: User) {
  return apiFetch<AdminDashboard>("/api/admin/dashboard", {
    user,
    redirectOn401: false,
  });
}
