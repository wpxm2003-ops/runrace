"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import {
  cancelJoinRequest,
  useMyApplications,
  invalidateMyApplications,
  toDisplayError,
} from "@/lib/api";
import { crewDetailHref } from "@/lib/crewRoute";
import { handleAuthFailure } from "@/lib/auth";
import { nativeNavigate } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

/** 미소속 홈 — 대기중인 가입 신청 현황 + 취소. 신청이 없으면 렌더하지 않는다. */
export function MyApplicationsSection({ user }: { user: User }) {
  const { t } = useLocale();
  const { data, mutate } = useMyApplications(user);
  const [cancelingId, setCancelingId] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  async function onCancel(requestId: number) {
    if (cancelingId) return;
    setCancelingId(requestId);
    try {
      await cancelJoinRequest(requestId, user);
      toast.success(t.toast_crew_application_canceled);
      void mutate();
      invalidateMyApplications(user.uid);
    } catch (e) {
      if (!handleAuthFailure(e, "/crew")) toast.error(toDisplayError(e) ?? t.error_occurred);
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.crew_my_applications_heading}</div>
      <div className="mt-2 divide-y divide-zinc-100">
        {data.map((a) => (
          <div key={a.requestId} className="flex items-center justify-between gap-3 py-2.5">
            <button
              type="button"
              onClick={() => nativeNavigate(crewDetailHref(a.crewId))}
              className="min-w-0 flex-1 text-left"
            >
              <div className="truncate text-sm font-medium text-zinc-900">{a.crewName}</div>
              <div className="text-[11px] font-medium text-amber-600">
                {t.crew_my_applications_pending_label}
              </div>
            </button>
            <button
              type="button"
              disabled={cancelingId === a.requestId}
              onClick={() => onCancel(a.requestId)}
              className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              {t.crew_my_applications_cancel_btn}
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
