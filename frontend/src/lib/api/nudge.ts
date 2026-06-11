import type { User } from "firebase/auth";
import { apiFetch } from "./client";

/**
 * 레이스 참가자에게 콕 찌르기(독려)를 보낸다. 진행 중인 레이스의 공동 참가자만 가능.
 * variant는 보낸 사람이 고른 프리셋 문구 인덱스(수신자 언어로 렌더링됨).
 */
export function nudgeMember(
  challengeId: number,
  targetUserId: string,
  variant: number,
  user: User,
) {
  return apiFetch<void>(`/api/challenges/${challengeId}/nudge/${targetUserId}`, {
    method: "POST",
    body: { variant },
    user,
  });
}
