"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Badge } from "@/app/_components/ui/Badge";
import { Card } from "@/app/_components/ui/Card";
import { kickCrewMember, reportAndDisplay } from "@/lib/api";
import type { CrewView } from "@/lib/api/types";
import { handleAuthFailure } from "@/lib/auth";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

/** 리더 전용 — 멤버 목록 + 내보내기. */
export function MemberSection({ crew, user, onChanged }: { crew: CrewView; user: User; onChanged: () => void }) {
  const { t } = useLocale();
  const confirm = useConfirm();
  const [kickingId, setKickingId] = useState<string | null>(null);

  async function onKick(memberUserId: string, nickname: string | null) {
    const ok = await confirm({
      title: t.crew_kick_confirm_title,
      message: t.crew_kick_confirm_message(nickname ?? t.no_name),
      confirmLabel: t.crew_kick_btn,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok) return;
    setKickingId(memberUserId);
    try {
      await kickCrewMember(crew.id, memberUserId, user);
      toast.success(t.toast_crew_kicked);
      onChanged();
    } catch (e) {
      if (!handleAuthFailure(e, "/crew/settings")) toast.error(reportAndDisplay(e) ?? t.error_occurred);
    } finally {
      setKickingId(null);
    }
  }

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.crew_members_heading}</div>
      <div className="mt-3 flex flex-col gap-2">
        {crew.members.map((m) => (
          <div
            key={m.userId}
            className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 p-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-zinc-900">
                {m.nickname ?? t.no_name}
              </span>
              {m.isLeader ? <Badge tone="amber">{t.crew_leader_badge}</Badge> : null}
              {m.isMe ? <Badge tone="emerald">{t.crew_me_badge}</Badge> : null}
            </div>
            {!m.isMe ? (
              <button
                type="button"
                disabled={kickingId === m.userId}
                onClick={() => onKick(m.userId, m.nickname)}
                className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                {t.crew_kick_btn}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
