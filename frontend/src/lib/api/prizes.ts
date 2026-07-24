import type { User } from "firebase/auth";
import { ApiError } from "./apiError";
import { apiFetch, apiUrl, publicFetch, uploadMultipart } from "./client";
import type { PrizeAwardType, PrizeFormItem, PrizeResult, PrizeRow } from "./types";

/** 경품 목록(전체 공개). 생성자면 imageKey 포함. */
export function fetchPrizes(challengeId: number, user: User | null) {
  return publicFetch<PrizeRow[]>(`/api/challenges/${challengeId}/prizes`, user);
}

/** 경품 저장(전체 교체) — 생성자·시작 전만. 빈 배열 = 전체 삭제. */
export function savePrizes(
  challengeId: number,
  prizes: PrizeFormItem[],
  awardType: PrizeAwardType,
  user: User,
) {
  const body = {
    awardType,
    prizes: prizes.map((p) => ({
      rank: p.rank,
      name: p.name,
      imageKey: p.imageKey,
      keepImage: p.keepImage ?? false,
      keepImageFromRank: p.keepImageFromRank ?? null,
    })),
  };
  return apiFetch<void>(`/api/challenges/${challengeId}/prizes`, { method: "PUT", user, body });
}

export function fetchMyPrizeResult(challengeId: number, user: User) {
  return apiFetch<PrizeResult>(`/api/challenges/${challengeId}/prizes/result`, { user });
}

/** 비공개 이미지(경품) 업로드 → 객체 키 반환(공개 URL 아님). */
export function uploadPrivateImage(file: File, user: User): Promise<string> {
  return uploadMultipart("/api/uploads/private-image", file, user, "key");
}

/**
 * 경품 이미지를 인증 fetch로 받아 object URL을 만든다.
 * <img>는 Authorization 헤더를 못 보내므로 blob으로 받아 URL.createObjectURL.
 * 서버가 종료+해당 등수를 검증하므로, 권한 없으면 throw.
 */
export async function fetchPrizeImageObjectUrl(
  challengeId: number,
  rank: number,
  user: User,
): Promise<string> {
  const token = await user.getIdToken();
  const res = await fetch(apiUrl(`/api/challenges/${challengeId}/prizes/${rank}/image`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    // 상태 코드를 담아 던진다 — 401은 호출부에서 handleAuthFailure로 로그인 유도.
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, `prize_image ${res.status}: ${text}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
