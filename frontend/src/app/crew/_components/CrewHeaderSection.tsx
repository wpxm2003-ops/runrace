"use client";

import { Card } from "@/app/_components/ui/Card";
import type { CrewView } from "@/lib/api/types";
import { formatDistance } from "@/lib/units";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { toast } from "sonner";

/** 크루 홈 헤더 — 크루명·인원·누적 스탯·공지 + 초대 코드 복사(리더). */
export function CrewHeaderSection({ crew }: { crew: CrewView }) {
  const { t } = useLocale();
  const { unit } = useUnit();

  async function copyInvite() {
    // 링크 대신 초대 코드+안내 문구를 복사한다 — 카톡 인앱/딥링크 제약을 우회하고,
    // 받는 사람이 앱 홈의 크루 버튼에서 코드로 직접 가입한다.
    try {
      await navigator.clipboard.writeText(t.crew_invite_copy_text(crew.joinCode));
      toast.success(t.crew_invite_copied);
    } catch {
      toast.error(t.error_occurred);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold text-zinc-900">{crew.name}</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {t.crew_member_count(crew.members.length, crew.maxMembers)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-400">
            {t.crew_stat_all_time} · {formatDistance(crew.allTimeDistanceM, unit)}
          </div>
        </div>
        {crew.isLeader ? (
          <button
            type="button"
            onClick={copyInvite}
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            {t.crew_invite_btn}
          </button>
        ) : null}
      </div>
      {crew.notice ? (
        <div className="mt-3 rounded-xl bg-zinc-50 px-3 py-2.5">
          <span className="mr-2 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            {t.crew_notice_label}
          </span>
          <span className="text-sm text-zinc-700">{crew.notice}</span>
        </div>
      ) : null}
    </Card>
  );
}
