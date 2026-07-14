"use client";

import { useState } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import { ChallengeInfiniteList } from "@/app/_components/ChallengeInfiniteList";
import { RacePhaseFilter, type RacePhaseFilterValue } from "@/app/_components/RacePhaseFilter";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { useCrewRaceListInfinite, toDisplayError } from "@/lib/api";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";

export default function CrewRacesPage() {
  const { user, loading } = useRequireAuth("/crew/races");
  const { t } = useLocale();
  const [phase, setPhase] = useState<RacePhaseFilterValue>("active");
  const result = useCrewRaceListInfinite(user, phase);

  const labels: Record<RacePhaseFilterValue, string> = {
    active: t.races_filter_active,
    ended: t.races_filter_ended,
  };

  function changePhase(next: RacePhaseFilterValue) {
    setPhase(next);
    void result.setSize(1);
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
