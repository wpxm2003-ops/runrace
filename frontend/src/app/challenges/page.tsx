"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { useChallengeListInfinite } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
import { ChallengeListItem } from "@/app/_components/ChallengeListItem";
import {
  RacePhaseFilter,
  type RacePhaseFilterValue,
} from "@/app/_components/RacePhaseFilter";
import { useAuthUser } from "@/lib/useAuthUser";
import { useLocale } from "@/lib/i18n";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

export default function ChallengesPage() {
  const { user, loading: authLoading } = useAuthUser();
  const { t, locale } = useLocale();
  const [showAllLangs, setShowAllLangs] = useState(false);
  const [phaseFilter, setPhaseFilter] = useState<RacePhaseFilterValue>("active");

  const lang = showAllLangs ? undefined : locale;

  const { data: pages, size, setSize, isLoading, isValidating, error } =
    useChallengeListInfinite(user, authLoading, lang, phaseFilter);

  useEffect(() => {
    void setSize(1);
  }, [phaseFilter, lang, setSize]);

  const items = useMemo(
    () => (pages ? pages.flatMap((p) => p.items) : []),
    [pages],
  );
  const hasNext = pages ? (pages[pages.length - 1]?.hasNext ?? false) : false;
  const initialLoading = isLoading && !pages;

  const sentinelRef = useInfiniteScroll({ hasNext, isValidating, setSize, size });

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
                <ChallengeListItem key={c.id} challenge={c} showJoinedBadge />
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
