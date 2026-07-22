"use client";

import type { CrewMatchSummary } from "@/lib/api/types";
import { nativeNavigate } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";

/** 대항전 요약 한 줄 — 탭하면 상세로. */
export function MatchRow({ m, text }: { m: CrewMatchSummary; text: string }) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      onClick={() => nativeNavigate(`/crew/match?id=${m.id}`)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-100 p-3 text-left hover:bg-zinc-50"
    >
      <span className="min-w-0 truncate text-sm text-zinc-800">{text}</span>
      <span className="shrink-0 text-xs text-zinc-400">{t.crew_match_view} ›</span>
    </button>
  );
}
