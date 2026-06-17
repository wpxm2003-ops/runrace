import { preload } from "swr";
import type { User } from "firebase/auth";
import { fetchChallengeDetail } from "@/lib/api/challenges";
import type { ChallengeListItem } from "@/lib/api/types";

/**
 * 목록 → 상세 진입 시, 방금 탭한 레이스의 목록 데이터를 잠깐 보관하고
 * 상세 API를 즉시 prefetch한다.
 *
 * - 헤더(제목·목표·기간)는 목록 데이터로 즉시 렌더 → 상세 API 대기 없이 화면 전환 느낌
 * - SWR preload: 상세 페이지가 마운트되기 전에 이미 네트워크 요청이 진행 중 →
 *   페이지 마운트 후 useSWR이 동일 key로 붙으면 in-flight 요청을 재활용하거나 캐시 히트
 * - user를 넘기면 인증된 상세(canJoin·isMember 등)를 prefetch, null이면 공개 데이터만
 * - 메모리 전용 — 정확한 값은 항상 상세 응답으로 대체된다.
 */
const previews = new Map<number, ChallengeListItem>();

export function setChallengePreview(item: ChallengeListItem, user?: User | null): void {
  previews.set(item.id, item);
  // useChallengeDetail의 SWR key와 정확히 일치시켜야 캐시가 연결된다.
  preload(
    ["challenge", item.id, user?.uid ?? null],
    () => fetchChallengeDetail(item.id, user),
  );
}

export function getChallengePreview(id: number | null | undefined): ChallengeListItem | null {
  if (id == null) return null;
  return previews.get(id) ?? null;
}
