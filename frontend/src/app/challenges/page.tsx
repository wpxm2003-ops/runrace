"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { ChallengeInfiniteList } from "@/app/_components/ChallengeInfiniteList";
import { useChallengeListInfinite } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
import {
  RacePhaseFilter,
  type RacePhaseFilterValue,
} from "@/app/_components/RacePhaseFilter";
import { useAuthUser } from "@/lib/useAuthUser";
import { useLocale } from "@/lib/i18n";
import { savePageState, loadPageState, usePageScrollRestore } from "@/lib/pageStateStore";

const STORE_KEY = "page:challenges";
/** 뒤로가기 시 복원할 최대 페이지 수. */
const MAX_RESTORE_SIZE = 5;

export default function ChallengesPage() {
  const { user, loading: authLoading, hint: authHint } = useAuthUser();
  const { t, locale } = useLocale();

  // 직전 로그인 기록(hint)이 있으면 인증 복원까지 기다렸다가 user.uid가 채워진 키로 한 번에 fetch한다.
  // 익명→로그인 재요청으로 "참여중" 라벨이 깜빡이거나 페이지 size가 리셋되어 스크롤 복원이 깨지는 것을 막는다.
  const waitForAuth = authLoading && authHint;

  // ── 필터 상태: 이전 방문 값 복원 ─────────────────────────────────────
  const [showAllLangs, setShowAllLangs] = useState(() => {
    return loadPageState(STORE_KEY).showAllLangs ?? false;
  });
  const [phaseFilter, setPhaseFilter] = useState<RacePhaseFilterValue>(() => {
    const saved = loadPageState(STORE_KEY).phase;
    return (saved === "active" || saved === "ended") ? saved : "active";
  });

  const lang = showAllLangs ? undefined : locale;

  const result = useChallengeListInfinite(user, lang, phaseFilter, waitForAuth);
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

  // ── 필터 변경 시 size 리셋 (마운트 시에는 실행하지 않음) ──────────────
  const filterMounted = useRef(false);
  useEffect(() => {
    if (!filterMounted.current) {
      filterMounted.current = true;
      return;
    }
    void setSize(1);
    savePageState(STORE_KEY, { size: 1 });
  }, [phaseFilter, lang, setSize]);

  // ── 상태 변경 시 저장 ────────────────────────────────────────────────
  useEffect(() => {
    savePageState(STORE_KEY, { phase: phaseFilter, size, showAllLangs });
  }, [phaseFilter, size, showAllLangs]);

  const filterLabel: Record<RacePhaseFilterValue, string> = useMemo(
    () => ({
      active: t.races_filter_active,
      ended: t.races_filter_ended,
    }),
    [t],
  );

  function onCreateClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!user) {
      e.preventDefault();
      redirectToLogin("/challenges/create");
    }
  }

  return (
    <PageLayout
      title={t.races_title}
      actions={
        <Link
          href="/challenges/create"
          onClick={onCreateClick}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {t.races_create_btn}
        </Link>
      }
    >
      {error ? <Alert className="mb-4">{String(error)}</Alert> : null}

      <Card>
        <div className="flex flex-col gap-3">
          <div className="text-base font-semibold">{t.races_list_heading}</div>
          <RacePhaseFilter
            value={phaseFilter}
            onChange={setPhaseFilter}
            labels={filterLabel}
            ariaLabel={t.races_filter_label}
          />
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={showAllLangs}
              onChange={(e) => setShowAllLangs(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            {t.races_show_all_langs}
          </label>
        </div>
        <ChallengeInfiniteList
          result={result}
          emptyLabel={t.races_filter_empty}
          skeletonCount={3}
          showJoinedBadge
          forceLoading={waitForAuth}
        />
      </Card>
    </PageLayout>
  );
}
