import type { User } from "firebase/auth";
import { apiFetch } from "./client";

/** KPI 이벤트 기록. propsJson은 JSON 문자열(서버가 그대로 저장). */
export function trackEvent(name: string, propsJson: string, user: User) {
  return apiFetch<void>("/api/analytics/events", {
    method: "POST",
    user,
    body: { name, propsJson },
  });
}
