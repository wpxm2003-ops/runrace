"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import {
  approveJoinRequest,
  rejectJoinRequest,
  useLeaderJoinRequests,
  invalidateMyCrew,
  invalidateLeaderJoinRequests,
  reportAndDisplay,
} from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { RejectModal } from "./RejectModal";

/** 리더 전용 — 가입 신청 인박스(대기중 전체). 신청 없으면 안내문만 표시. */
export function JoinRequestInbox({ user, onChanged }: { user: User; onChanged: () => void }) {
  const { t, locale } = useLocale();
  const { data, isLoading, mutate } = useLeaderJoinRequests(user, true);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);

  function inboxErrorMessage(e: unknown): string {
    const msg = String(e);
    if (msg.includes("request_already_decided")) return t.crew_inbox_err_already_decided;
    if (msg.includes("applicant_already_in_crew")) return t.crew_inbox_err_applicant_already_in_crew;
    if (msg.includes("crew_full")) return t.crew_inbox_err_crew_full;
    return reportAndDisplay(e);
  }

  async function onApprove(requestId: number) {
    if (approvingId) return;
    setApprovingId(requestId);
    try {
      await approveJoinRequest(requestId, user);
      toast.success(t.toast_crew_join_approved);
      onChanged();
    } catch (e) {
      toast.error(inboxErrorMessage(e));
    } finally {
      setApprovingId(null);
      void mutate();
      invalidateMyCrew(user.uid);
      invalidateLeaderJoinRequests(user.uid);
    }
  }

  async function onReject(reason: string) {
    if (rejectTarget == null || rejecting) return;
    setRejecting(true);
    try {
      await rejectJoinRequest(rejectTarget, reason || null, user);
      toast.success(t.toast_crew_join_rejected);
      setRejectTarget(null);
    } catch (e) {
      toast.error(inboxErrorMessage(e));
    } finally {
      setRejecting(false);
      void mutate();
      invalidateLeaderJoinRequests(user.uid);
    }
  }

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.crew_inbox_heading}</div>
      {isLoading && !data ? (
        <div className="mt-3"><SkeletonLines count={2} /></div>
      ) : !data || data.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{t.crew_inbox_empty}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {data.map((r) => (
            <div key={r.requestId} className="rounded-xl border border-zinc-100 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-zinc-900">
                  {r.applicantNickname ?? t.no_name}
                </span>
                <span className="shrink-0 text-[11px] text-zinc-400">
                  {formatDate(r.appliedAt, locale)}
                </span>
              </div>
              {r.message ? <p className="mt-1 text-sm text-zinc-600">{r.message}</p> : null}
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  disabled={approvingId === r.requestId}
                  onClick={() => onApprove(r.requestId)}
                  className="h-9 flex-1 rounded-lg bg-zinc-900 text-xs font-medium text-white disabled:opacity-50"
                >
                  {t.crew_inbox_approve_btn}
                </button>
                <button
                  type="button"
                  disabled={approvingId === r.requestId}
                  onClick={() => setRejectTarget(r.requestId)}
                  className="h-9 flex-1 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {t.crew_inbox_reject_btn}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {rejectTarget != null ? (
        <RejectModal
          onClose={() => setRejectTarget(null)}
          onSubmit={onReject}
          submitting={rejecting}
        />
      ) : null}
    </Card>
  );
}
