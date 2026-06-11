"use client";

import { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import {
  invalidateChallengeWorkouts,
  usePendingApprovals,
  useRejectedApprovals,
  voteIndoorRun,
} from "@/lib/api";
import type { ChallengeDetail } from "@/lib/api/types";

/**
 * 실내러닝 승인 대기·거부 목록 + 낙관적 투표 처리를 한 곳에 모은다.
 * 투표 시 카드 상태를 먼저 반영하고(낙관적), 성공하면 관련 SWR 캐시를 재검증한다.
 */
export function useIndoorRunApprovals({
  id,
  user,
  detail,
  mutateDetail,
  onError,
}: {
  id: number | null;
  user: User | null;
  detail: ChallengeDetail | undefined;
  mutateDetail: () => Promise<unknown>;
  onError: (message: string) => void;
}) {
  // 레이스 참여 중이고 시작된 경우에만 조회(SWR 캐시·중복요청 방지)
  const approvalsEnabled = !!(detail?.isMember && detail?.hasStarted);
  const { data: pendingApprovals = [], mutate: mutatePending } =
    usePendingApprovals(id, user, approvalsEnabled);
  const { data: rejectedApprovals = [], mutate: mutateRejected } =
    useRejectedApprovals(id, user, approvalsEnabled);

  const [votingId, setVotingId] = useState<number | null>(null);

  const myNickname = useMemo(() => {
    if (!detail?.currentUserId) return null;
    const nickname = detail.members.find((m) => m.userId === detail.currentUserId)?.nickname;
    return nickname?.trim() ? nickname : null;
  }, [detail]);

  async function refreshApprovalViews() {
    if (!id || !user) return;
    await Promise.all([mutatePending(), mutateRejected()]);
    await mutateDetail();
    invalidateChallengeWorkouts(id, user.uid);
  }

  async function onVote(workoutId: number, approved: boolean) {
    if (!user) return;
    setVotingId(workoutId);
    const prevPending = pendingApprovals;
    const prevRejected = rejectedApprovals;

    // 버튼 클릭 직후 카드 상태를 먼저 반영 (낙관적 업데이트, 재검증은 투표 성공 후)
    const votedItem = prevPending.find((item) => item.workoutId === workoutId);
    if (!approved) {
      mutatePending(
        (items = []) => items.filter((item) => item.workoutId !== workoutId),
        { revalidate: false },
      );
      const rejectorNickname = myNickname;
      if (votedItem && rejectorNickname) {
        mutateRejected(
          (items = []) => {
            if (items.some((r) => r.challengeWorkoutId === votedItem.challengeWorkoutId)) return items;
            return [
              {
                challengeWorkoutId: votedItem.challengeWorkoutId,
                workoutId: votedItem.workoutId,
                submitterNickname: votedItem.submitterNickname,
                distanceM: votedItem.distanceM,
                durationSec: votedItem.durationSec,
                imageUrl: votedItem.imageUrl,
                startedAt: votedItem.startedAt,
                rejectorNicknames: [rejectorNickname],
              },
              ...items,
            ];
          },
          { revalidate: false },
        );
      }
    } else {
      mutatePending(
        (items = []) =>
          items
            .map((item) =>
              item.workoutId === workoutId
                ? {
                    ...item,
                    myVote: true,
                    approvedCount: Math.min(item.totalVoters, item.approvedCount + 1),
                  }
                : item,
            )
            .filter(
              (item) =>
                !(item.workoutId === workoutId && item.approvedCount >= item.totalVoters),
            ),
        { revalidate: false },
      );
    }

    try {
      await voteIndoorRun(workoutId, approved, user);
      await refreshApprovalViews();
    } catch (e) {
      mutatePending(prevPending, { revalidate: false });
      mutateRejected(prevRejected, { revalidate: false });
      onError(String(e));
    } finally {
      setVotingId(null);
    }
  }

  return { pendingApprovals, rejectedApprovals, votingId, onVote };
}
