"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { toDisplayError, useCrewDiscoveryInfinite } from "@/lib/api";
import {
  CREW_DISCOVERY_FEATURED_REGIONS,
  CREW_REGIONS,
  crewRegionLabel,
  type CrewRegionCode,
} from "@/lib/crewRegion";
import { CrewRegionPickerSheet, type CrewRegionOption } from "./CrewRegionPicker";
import { CrewDiscoveryCard } from "./CrewDiscoveryCard";
import { RegionChip } from "./RegionChip";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useLocale } from "@/lib/i18n";

/** 크루 발견 — 시도 지역 필터 + 리치 카드(썸네일·지역·정기런 요약), 10개 단위 더보기. 비회원도 조회 가능. */
export function CrewDiscovery({ user }: { user: User | null }) {
  const { t, locale } = useLocale();
  const [region, setRegion] = useState<CrewRegionCode | "">("");
  const [regionSheetOpen, setRegionSheetOpen] = useState(false);
  const { data, size, setSize, isLoading, isValidating, error } = useCrewDiscoveryInfinite(region, user);
  const featuredRegions = [...CREW_DISCOVERY_FEATURED_REGIONS];
  const featuredSet = new Set<string>(featuredRegions);
  const selectedOutsideFeatured = region !== "" && !featuredSet.has(region);
  const regionOptions: CrewRegionOption[] = [
    { value: "", label: t.crew_region_all },
    ...CREW_REGIONS.map((value) => ({ value, label: crewRegionLabel(value, t) })),
  ];
  const selectedRegionLabel =
    regionOptions.find((option) => option.value === region)?.label ?? t.crew_profile_region_label;

  const crews = data ? data.flatMap((p) => p.crews) : [];
  const lastPage = data?.[data.length - 1];
  const hasMore = lastPage?.hasMore ?? false;
  const isLoadingMore = isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");
  const loadMoreRef = useInfiniteScroll({ hasNext: hasMore, isValidating, setSize, size });

  useEffect(() => {
    setSize(1);
  }, [region, setSize]);

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.crew_discovery_heading}</div>
      <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <RegionChip label={t.crew_region_all} active={region === ""} onClick={() => setRegion("")} />
        {featuredRegions.map((r) => (
          <RegionChip
            key={r}
            label={crewRegionLabel(r, t)}
            active={region === r}
            onClick={() => setRegion(r)}
          />
        ))}
        {selectedOutsideFeatured ? (
          <RegionChip label={selectedRegionLabel} active onClick={() => setRegionSheetOpen(true)} />
        ) : null}
        <RegionChip
          label={t.crew_discovery_more}
          active={selectedOutsideFeatured}
          onClick={() => setRegionSheetOpen(true)}
        />
      </div>
      {regionSheetOpen ? (
        <CrewRegionPickerSheet
          title={t.crew_profile_region_label}
          value={region}
          options={regionOptions}
          onSelect={(value) => setRegion(value as CrewRegionCode | "")}
          onClose={() => setRegionSheetOpen(false)}
        />
      ) : null}
      {!data && isLoading ? (
        <div className="mt-3"><SkeletonLines count={3} /></div>
      ) : error && crews.length === 0 ? (
        <Alert>{toDisplayError(error) ?? t.error_occurred}</Alert>
      ) : crews.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{t.crew_discovery_empty}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {crews.map((crew) => (
            <CrewDiscoveryCard key={crew.id} crew={crew} t={t} locale={locale} />
          ))}
        </div>
      )}
      {hasMore ? <div ref={loadMoreRef} className="h-4 w-full" aria-hidden="true" /> : null}
      {isLoadingMore && crews.length > 0 ? (
        <p className="mt-2 text-center text-sm text-zinc-500">{t.crew_discovery_loading}</p>
      ) : null}
    </Card>
  );
}
