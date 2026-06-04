import type { User } from "firebase/auth";
import { apiFetch } from "./client";
import type { DailyDistanceBody, DailyDistanceResult } from "./types";

export function syncDailyDistance(body: DailyDistanceBody, user: User) {
  return apiFetch<DailyDistanceResult>("/api/fitness/daily-distance", {
    method: "POST",
    user,
    body,
  });
}
