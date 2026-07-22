"use client";

import type { CrewDiscoveryItem } from "@/lib/api/types";
import { crewDetailHref } from "@/lib/crewRoute";
import { crewRegionLabel } from "@/lib/crewRegion";
import { nativeNavigate } from "@/lib/nativeNav";
import { weekdayLabels } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

/** 발견 카드 한 줄 — 썸네일(64px)·지역뱃지·정원마감뱃지·정기런 요약. 탭하면 상세로 이동. */
export function CrewDiscoveryCard({
  crew,
  t,
  locale,
}: {
  crew: CrewDiscoveryItem;
  t: ReturnType<typeof useLocale>["t"];
  locale: string;
}) {
  const full = crew.memberCount >= crew.maxMembers;
  const weekdays = weekdayLabels(locale, true);
  const daysLabel = crew.meetupDays.length > 0
    ? crew.meetupDays.map((d) => weekdays[d]).join("·")
    : null;
  const meetupParts = [crew.meetupPlace, daysLabel, crew.meetupTime].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => nativeNavigate(crewDetailHref(crew.id))}
      className="flex w-full items-center gap-3 rounded-xl border border-zinc-100 p-3 text-left hover:bg-zinc-50"
    >
      {crew.imageUrl ? (
        <img
          src={crew.imageUrl}
          alt=""
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-lg font-semibold text-zinc-400">
          {crew.name.slice(0, 1)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-zinc-900">{crew.name}</span>
          {full ? (
            <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
              {t.crew_discovery_full_badge}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600">
            {crewRegionLabel(crew.region, t)}
          </span>
          <span>{t.crew_discovery_members(crew.memberCount)}</span>
        </div>
        {meetupParts.length > 0 ? (
          <div className="mt-1 truncate text-[11px] text-zinc-400">{meetupParts.join(" · ")}</div>
        ) : null}
      </div>
    </button>
  );
}
