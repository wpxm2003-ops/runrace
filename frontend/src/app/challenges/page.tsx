"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { ChallengeInfiniteList } from "@/app/_components/ChallengeInfiniteList";
import { useChallengeListInfinite, toDisplayError } from "@/lib/api";
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
  const { size, setSize, error, isLoading, data: pages } = result;
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

  // ── 상태 저장 ────────────────────────────────────────────────────────
  // phase·showAllLangs는 사용자가 직접 조작한 핸들러에서만 저장한다 — 아래 자동 완화가
  // 바꾼 값까지 저장하면, 사용자가 켠 적 없는 "모든 언어·종료 탭"이 다음 방문의 초기
  // 상태로 굳는다. size(무한스크롤 페이지 수)만 변화를 따라 저장한다.
  useEffect(() => {
    savePageState(STORE_KEY, { size });
  }, [size]);

  // ── 목록이 비면 단계적으로 조건을 완화한다 ──────────────────────────
  // ① 언어 필터 해제 → ② 그래도 비면 종료 탭. 각각 1회만(ref) — 사용자가 되돌리면 존중.
  //
  // ①이 필요한 이유: 시스템이 자동 생성하는 온램프 레이스는 langCd가 "ko" 고정이라
  // (ChallengeService.createOfficialRace) 다른 언어 사용자는 언어 필터를 풀지 않으면
  // 참가 가능한 레이스가 하나도 안 보인다 — 온보딩 CTA가 빈 화면으로 끝나게 된다.
  //
  // isLoading 가드가 없으면 단계가 즉시 연쇄한다: keepPreviousData 때문에 ①로 키가
  // 바뀌어도 pages는 직전(빈) 목록을 그대로 반환하므로, 새 응답을 기다리지 않으면
  // ②까지 한 번에 발화해 정작 보여줘야 할 전체 언어 active 목록을 건너뛴다.
  const autoAllLangsRef = useRef(false);
  const autoSwitchedRef = useRef(false);
  useEffect(() => {
    if (waitForAuth || error || isLoading) return;
    const lastPage = pages?.[pages.length - 1];
    // 완전히 로드된 빈 목록(더 불러올 것 없음)일 때만.
    const fullyEmpty = pages != null && itemCount === 0 && lastPage != null && !lastPage.hasNext;
    if (!fullyEmpty) return;

    if (!showAllLangs && !autoAllLangsRef.current) {
      autoAllLangsRef.current = true;
      setShowAllLangs(true);
      return;
    }
    if (phaseFilter === "active" && !autoSwitchedRef.current) {
      autoSwitchedRef.current = true;
      setPhaseFilter("ended");
    }
  }, [pages, itemCount, phaseFilter, showAllLangs, waitForAuth, error, isLoading]);

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
      {error ? (
        <Alert className="mb-4">
          {toDisplayError(error)}
          <button
            type="button"
            onClick={() => void result.mutate()}
            className="ml-2 underline"
          >
            {t.retry}
          </button>
        </Alert>
      ) : null}

      <Card>
        <div className="flex flex-col gap-3">
          <div className="text-base font-semibold">{t.races_list_heading}</div>
          <RacePhaseFilter
            value={phaseFilter}
            onChange={(v) => {
              setPhaseFilter(v);
              savePageState(STORE_KEY, { phase: v });
            }}
            labels={filterLabel}
            ariaLabel={t.races_filter_label}
          />
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={showAllLangs}
              onChange={(e) => {
                setShowAllLangs(e.target.checked);
                savePageState(STORE_KEY, { showAllLangs: e.target.checked });
              }}
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
