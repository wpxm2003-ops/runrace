"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { useChallengeListInfinite } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
import { challengeDetailHref } from "@/lib/challengeRoute";
import { ChallengePhaseBadge } from "@/app/_components/ChallengePhaseBadge";
import {
  RacePhaseFilter,
  type RacePhaseFilterValue,
} from "@/app/_components/RacePhaseFilter";
import { formatDateRange } from "@/lib/format";
import { useAuthUser } from "@/lib/useAuthUser";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatGoalDistance } from "@/lib/units";

export default function ChallengesPage() {
  const { user, loading: authLoading } = useAuthUser();
  const { t, locale } = useLocale();
  const { unit } = useUnit();
  const [showAllLangs, setShowAllLangs] = useState(false);
  const [phaseFilter, setPhaseFilter] = useState<RacePhaseFilterValue>("active");

  const lang = showAllLangs ? undefined : locale;

  const { data: pages, size, setSize, isLoading, isValidating, error } =
    useChallengeListInfinite(user, authLoading, lang, phaseFilter);

  // 필터·언어 변경 시 첫 페이지부터 다시 로드
  useEffect(() => {
    void setSize(1);
  }, [phaseFilter, lang, setSize]);

  const items = useMemo(
    () => (pages ? pages.flatMap((p) => p.items) : []),
    [pages],
  );
  const hasNext = pages ? (pages[pages.length - 1]?.hasNext ?? false) : false;
  const initialLoading = isLoading && !pages;

  // 무한 스크롤 — 센티넬이 보이면 다음 페이지 로드
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNext) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isValidating) {
          void setSize((s) => s + 1);
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNext, isValidating, setSize, size]);

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
          <div className="text-lg font-semibold">{t.races_list_heading}</div>
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
        <div className="mt-3 grid gap-2">
          {initialLoading ? (
            <SkeletonLines count={3} />
          ) : items.length === 0 ? (
            <div className="text-sm text-zinc-600">{t.races_filter_empty}</div>
          ) : (
            <>
              {items.map((c) => (
                <a
                  key={c.id}
                  href={challengeDetailHref(c.id)}
                  className="block rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{c.title}</div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {c.isMember ? (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                          {c.phase === "ENDED" ? t.races_joined_done : t.races_joined}
                        </span>
                      ) : null}
                      <ChallengePhaseBadge
                        startAt={c.startAt}
                        endAt={c.endAt}
                        apiPhase={c.phase}
                      />
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {t.races_goal_members(formatGoalDistance(c.goalKm, unit), c.memberCount)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {formatDateRange(c.startAt, c.endAt, locale)}
                  </div>
                </a>
              ))}
              {hasNext ? (
                <div
                  ref={sentinelRef}
                  className="py-3 text-center text-sm text-zinc-400"
                >
                  {t.loading}
                </div>
              ) : null}
            </>
          )}
        </div>
      </Card>
    </PageLayout>
  );
}
