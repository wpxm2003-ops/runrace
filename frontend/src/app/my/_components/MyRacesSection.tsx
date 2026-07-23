"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { ChallengeInfiniteList } from "@/app/_components/ChallengeInfiniteList";
import {
  RacePhaseFilter,
  type RacePhaseFilterValue,
} from "@/app/_components/RacePhaseFilter";
import { useMyChallengeListInfinite, toDisplayError } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { savePageState, loadPageState, usePageScrollRestore } from "@/lib/pageStateStore";

const STORE_KEY = "page:my";
/** 뒤로가기 시 복원할 최대 페이지 수. 너무 많으면 API 부하가 증가한다. */
const MAX_RESTORE_SIZE = 5;

/** 내가 참여한 레이스 — 예정·진행중 / 종료 2탭 + 무한스크롤. */
export function MyRacesSection({ user }: { user: User }) {
  const { t } = useLocale();

  // ── 탭 상태: 이전 방문 값 복원 ──────────────────────────────────────
  const [phase, setPhase] = useState<RacePhaseFilterValue>(() => {
    const saved = loadPageState(STORE_KEY).phase;
    return (saved === "active" || saved === "ended") ? saved : "active";
  });

  const result = useMyChallengeListInfinite(user, phase);
  const { size, setSize, error, data: pages } = result;
  const itemCount = pages ? pages.flatMap((p) => p.items).length : 0;

  usePageScrollRestore(STORE_KEY, itemCount);

  // ── 페이지 수 복원: 마운트 시 1회 ────────────────────────────────────
  const sizeRestored = useRef(false);
  useEffect(() => {
    if (sizeRestored.current) return;
    sizeRestored.current = true;
    const saved = Math.min(loadPageState(STORE_KEY).size ?? 1, MAX_RESTORE_SIZE);
    if (saved > 1) void setSize(saved);
  }, [setSize]);

  // ── 상태 변경 시 저장 ────────────────────────────────────────────────
  useEffect(() => {
    savePageState(STORE_KEY, { phase, size });
  }, [phase, size]);

  function handlePhaseChange(newPhase: RacePhaseFilterValue) {
    setPhase(newPhase);
    void setSize(1);
    // 탭 전환은 새로운 컨텍스트이므로 size를 1로 리셋해서 저장
    savePageState(STORE_KEY, { phase: newPhase, size: 1 });
  }

  const labels: Record<RacePhaseFilterValue, string> = {
    active: t.races_filter_active,
    ended: t.races_filter_ended,
  };

  return (
    <Card className="mt-4">
      <div className="flex flex-col gap-3">
        <div className="text-base font-semibold">{t.my_races_heading}</div>
        <RacePhaseFilter
          value={phase}
          onChange={handlePhaseChange}
          labels={labels}
          ariaLabel={t.races_filter_label}
        />
      </div>
      {error ? <Alert className="mt-3">{toDisplayError(error)}</Alert> : null}
      <ChallengeInfiniteList
        result={result}
        emptyLabel={t.my_races_empty}
        skeletonCount={2}
        showJoinedBadge
      />
    </Card>
  );
}
