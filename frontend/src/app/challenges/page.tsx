"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { useChallengeList } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
import { challengeDetailHref } from "@/lib/challengeRoute";
import { ChallengePhaseBadge } from "@/app/_components/ChallengePhaseBadge";
import { formatDateRange } from "@/lib/format";
import { useAuthUser } from "@/lib/useAuthUser";
import { useLocale } from "@/lib/i18n";

export default function ChallengesPage() {
  const { user, loading: authLoading } = useAuthUser();
  const { t } = useLocale();
  const { data: challenges = [], isLoading, error } = useChallengeList(user, authLoading);

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
        <a
          href="/challenges/create"
          onClick={onCreateClick}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {t.races_create_btn}
        </a>
      }
    >
      {error ? <Alert className="mb-4">{String(error)}</Alert> : null}

      <Card>
        <div className="text-lg font-semibold">{t.races_list_heading}</div>
        <div className="mt-3 grid gap-2">
          {isLoading ? (
            <SkeletonLines count={3} />
          ) : challenges.length === 0 ? (
            <div className="text-sm text-zinc-600">{t.races_empty}</div>
          ) : (
            challenges.map((c) => (
              <a
                key={c.id}
                href={challengeDetailHref(c.id)}
                className="block rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{c.title}</div>
                  <ChallengePhaseBadge
                    startAt={c.startAt}
                    endAt={c.endAt}
                    apiPhase={c.phase}
                  />
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {t.races_goal_members(c.goalKm, c.memberCount)}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {formatDateRange(c.startAt, c.endAt)}
                </div>
              </a>
            ))
          )}
        </div>
      </Card>
    </PageLayout>
  );
}
