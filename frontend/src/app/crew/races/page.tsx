"use client";

import { useEffect, useRef, useState } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import { ChallengeInfiniteList } from "@/app/_components/ChallengeInfiniteList";
import { RacePhaseFilter, type RacePhaseFilterValue } from "@/app/_components/RacePhaseFilter";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { useCrewRaceListInfinite, toDisplayError } from "@/lib/api";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { savePageState, loadPageState, usePageScrollRestore } from "@/lib/pageStateStore";

const STORE_KEY = "page:crew/races";
/** 뒤로가기 시 복원할 최대 페이지 수 — 과도한 API 부하 방지(내정보 레이스와 동일 정책). */
const MAX_RESTORE_SIZE = 5;

export default function CrewRacesPage() {
  const { user, loading } = useRequireAuth("/crew/races");
  const { t } = useLocale();
  // ── 탭·페이지수·스크롤 복원 — 상세에 다녀와도 보던 위치 유지(내정보 탭과 동일 동작) ──
  const [phase, setPhase] = useState<RacePhaseFilterValue>(() => {
    const saved = loadPageState(STORE_KEY).phase;
    return saved === "active" || saved === "ended" ? saved : "active";
  });
  const result = useCrewRaceListInfinite(user, phase);
  const { size, setSize, data: pages } = result;
  const itemCount = pages ? pages.flatMap((p) => p.items).length : 0;

  usePageScrollRestore(STORE_KEY, itemCount);

  const sizeRestored = useRef(false);
  useEffect(() => {
    if (sizeRestored.current) return;
    sizeRestored.current = true;
    const saved = Math.min(loadPageState(STORE_KEY).size ?? 1, MAX_RESTORE_SIZE);
    if (saved > 1) void setSize(saved);
  }, [setSize]);

  useEffect(() => {
    savePageState(STORE_KEY, { phase, size });
  }, [phase, size]);

  const labels: Record<RacePhaseFilterValue, string> = {
    active: t.races_filter_active,
    ended: t.races_filter_ended,
  };

  function changePhase(next: RacePhaseFilterValue) {
    setPhase(next);
    void result.setSize(1);
    // 탭 전환은 새 컨텍스트 — size를 1로 리셋해서 저장
    savePageState(STORE_KEY, { phase: next, size: 1 });
  }

  return (
    <PageLayout
      title={t.crew_races_heading}
      actions={
        <button
          type="button"
          onClick={() => nativeNavigate("/challenges/create?crew=1")}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {t.crew_race_create_btn}
        </button>
      }
    >
      <Card>
        <RacePhaseFilter
          value={phase}
          onChange={changePhase}
          labels={labels}
          ariaLabel={t.races_filter_label}
        />
        {result.error ? (
          <Alert className="mt-3">
            {toDisplayError(result.error)}
            <button type="button" onClick={() => void result.mutate()} className="ml-2 underline">
              {t.retry}
            </button>
          </Alert>
        ) : null}
        <ChallengeInfiniteList
          result={result}
          emptyLabel={t.crew_races_empty}
          skeletonCount={3}
          showJoinedBadge
          forceLoading={loading || !user}
        />
      </Card>
    </PageLayout>
  );
}
