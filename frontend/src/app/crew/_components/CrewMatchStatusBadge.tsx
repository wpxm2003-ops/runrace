"use client";

import type { CrewMatchStatus } from "@/lib/api/types";
import { useLocale } from "@/lib/i18n";

const STATUS_CLASSES: Record<CrewMatchStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  SCHEDULED: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-sky-100 text-sky-700",
  ENDED: "bg-zinc-100 text-zinc-500",
  DECLINED: "bg-zinc-100 text-zinc-500",
  EXPIRED: "bg-zinc-100 text-zinc-500",
};

const SIZE_CLASSES = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-[11px]",
} as const;

function statusLabel(status: CrewMatchStatus, t: ReturnType<typeof useLocale>["t"]): string {
  switch (status) {
    case "PENDING": return t.crew_match_status_pending;
    case "SCHEDULED": return t.crew_match_status_scheduled;
    case "IN_PROGRESS": return t.races_filter_in_progress;
    case "ENDED": return t.races_filter_ended;
    case "DECLINED": return t.crew_match_status_declined;
    case "EXPIRED": return t.crew_match_status_expired;
  }
}

export function CrewMatchStatusBadge({
  status,
  size = "sm",
  suffix,
}: {
  status: CrewMatchStatus;
  size?: keyof typeof SIZE_CLASSES;
  /** IN_PROGRESS 등에서 "D-3"처럼 라벨 뒤에 덧붙일 텍스트. */
  suffix?: string;
}) {
  const { t } = useLocale();
  return (
    <span
      className={`shrink-0 rounded font-medium ${SIZE_CLASSES[size]} ${STATUS_CLASSES[status]}`}
    >
      {statusLabel(status, t)}
      {suffix ? ` · ${suffix}` : ""}
    </span>
  );
}
